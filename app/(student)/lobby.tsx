import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Alert, BackHandler, ScrollView, Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Check, User, ShieldAlert, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLobby } from '@/hooks/useRepositories';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';
import { QuestionRepository, LobbyRepository, StudentRepository } from '@/repositories';
import { useExamStore, useLobbyStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';
import { PeerExamClient } from '@/services/peerExamClient';
import { OfflineStore } from '@/services/offlineStore';
import { ExamPreloader } from '@/services/examPreloader';

/**
 * DETERMINISTIC LOBBY STATES
 */
type LobbyState = 'DASHBOARD' | 'STARTING' | 'ERROR';

function useLobbyController() {
  const router = useRouter();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const selectedStudent = useStudentStore((s) => s.selectedStudent);
  const examPasskey = useStudentStore((s) => s.examPasskey);
  const setVerifiedStudent = useStudentStore((s) => s.setVerifiedStudent);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const storedSnapshot = useLobbyStore((s) => s.snapshot);
  const setQuestions = useExamStore((s) => s.setQuestions);
  const setSessionId = useExamStore((s) => s.setSessionId);
  const startExam = useExamStore((s) => s.startExam);

  const [state, setState] = useState<LobbyState>('DASHBOARD');
  const [error, setError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<number>(Date.now());
  const [lastSuccessAt, setLastSuccessAt] = useState<number>(Date.now());

  const hasJoined = useRef(false);
  const hasEntered = useRef(false);

  // Polling is ALWAYS active on this screen to ensure proctor stays updated.
  const lobbyQuery = useLobby(scannedSessionId ?? undefined, undefined, true);

  // Anti-Stale Data Strategy (Fix Root Cause 3)
  const isStale = Date.now() - lastSuccessAt > 15000;

  const lobbyData = useMemo(() => {
    if (lobbyQuery.data) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        setLastSuccessAt(Date.now());
        return lobbyQuery.data;
    }
    return storedSnapshot;
  }, [lobbyQuery.data, storedSnapshot]);

  // -- SIGNAL MONITOR (UN-GATED - Fix Root Cause 2) --
  useEffect(() => {
    if (hasEntered.current) return;

    // Priority 1: Check snapshot status
    if (lobbyData?.status === 'in_progress') {
        console.log('[LOBBY_CTL] START_SIGNAL_BY_SNAPSHOT');
        setState('STARTING');
        return;
    }

    const checkSignal = async () => {
        // Ultra-fast Global status check
        const global = await PeerExamClient.getGlobalStatus();
        if (global?.examStarted || global?.roomStatus === 'in_progress') {
             console.log('[LOBBY_CTL] START_SIGNAL_BY_GLOBAL_PULSE');
             setState('STARTING');
             return;
        }

        // Standard student-specific check
        const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
        if (token) {
            const quick = await PeerExamClient.getQuickStatus(token);
            if (quick?.s === 'in_progress' || quick?.ss === 'taking_exam') {
                 setState('STARTING');
            }
        }
    };
    const id = setInterval(checkSignal, 2500);
    return () => clearInterval(id);
  }, [lobbyData?.status]);

  // -- EXAM TRANSITION --
  useEffect(() => {
    if (state !== 'STARTING' || hasEntered.current || !lobbyData) return;
    const go = async () => {
        hasEntered.current = true;
        try {
            console.log('[LOBBY_CTL] INITIALIZING_EXAMINATION');

            // 1. Fast path: check preloaded questions from lobby waiting phase
            let questions = await ExamPreloader.getPreloadedQuestions();

            // 2. If not preloaded yet, fetch from repository (with resilient retry)
            if (!questions || !questions.length) {
              questions = await QuestionRepository.getQuestions(scannedSessionId!);
            }

            if (!questions || !questions.length) {
              throw new Error('No questions found in examination module.');
            }

            setSessionId(scannedSessionId!);
            setQuestions(questions);
            startExam(lobbyData.session?.durationMinutes || 90);

            console.log('[LOBBY_CTL] NAVIGATING_TO_EXAM_SCREEN');
            router.replace('/(student)/exam');
        } catch (err) {
            console.error('[LOBBY_CTL] ENTRY_CRASH:', err);
            hasEntered.current = false;
            setState('DASHBOARD');
            const detail = err instanceof Error ? err.message : 'Stay connected to the examination Wi‑Fi and try again.';
            Alert.alert(
              'Load Failure',
              `Could not open examination.\n\n${detail}`,
            );
        }
    };
    void go();
  }, [state, lobbyData, scannedSessionId]);

  // -- PRESENCE HEARTBEAT (Always Active) --
  useEffect(() => {
    const id = setInterval(async () => {
        try {
            const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
            if (!token) return;
            await LobbyRepository.sendHeartbeat();
            setLastSeen(Date.now());
        } catch { }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // -- BACKGROUND HANDSHAKE --
  const initializeAndJoin = useCallback(async () => {
    if (!scannedSessionId || (!verifiedStudent && !selectedStudent)) {
        router.replace('/');
        return;
    }

    if (!verifiedStudent && !hasJoined.current) {
        hasJoined.current = true;
        try {
            const verified = { ...selectedStudent! };
            const lobby = examPasskey
                ? await LobbyRepository.joinWithPasskey(verified, scannedSessionId!, examPasskey)
                : await LobbyRepository.joinStudent(verified, scannedSessionId!);

            const regId = lobby.registration_id || lobby.students?.find(s => s.studentId === verified.studentId)?.id;
            if (regId) verified.registration_id = Number(regId);

            setVerifiedStudent(verified);
            setSnapshot(lobby);
            setLastSuccessAt(Date.now());

            // PRELOAD QUESTIONS IN BACKGROUND WHILE WAITING FOR PROCTOR TO START
            // PRELOAD QUESTIONS IN BACKGROUND IF NOT ALREADY READY
            void (async () => {
              try {
                await ExamPreloader.preloadQuestions(scannedSessionId!);
                console.log('[LOBBY_CTL] Preload successful in background.');
                const isReady = await ExamPreloader.isReady();
                if (!isReady) {
                  await ExamPreloader.preloadQuestions(scannedSessionId!);
                  console.log('[LOBBY_CTL] Preload successful in background.');
                } else {
                  console.log('[LOBBY_CTL] Package already preloaded and verified.');
                }
              } catch (preloadErr) {
                console.warn('[LOBBY_CTL] Background preload warning:', preloadErr);
              }
            })();
        } catch (e) {
            console.warn("Lobby handshake delay...", e);
            hasJoined.current = false;
        }
    }
  }, [scannedSessionId, verifiedStudent, selectedStudent, examPasskey, router, setVerifiedStudent, setSnapshot]);

  useEffect(() => { void initializeAndJoin(); }, [initializeAndJoin]);

  return {
    state,
    error,
    currentStudent: verifiedStudent || selectedStudent,
    lobbyData,
    lastSeen,
    isStale,
    lobbyQuery
  };
}

export default function StudentLobbyScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const controller = useLobbyController();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false, headerShown: false });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backSub.remove();
  }, [navigation]);

  if (hasError) {
      return (
          <View style={styles.crashWrap}>
              <AlertTriangle size={48} color={colors.danger} />
              <Text style={styles.crashTitle}>Dashboard Error</Text>
              <Button title="Recover" onPress={() => setHasError(false)} />
          </View>
      );
  }

  const { lobbyData, currentStudent, isStale } = controller;

  const handleExit = () => {
    Alert.alert(
      'Exit Examination',
      'Are you sure you want to leave the examination lobby and return to the main landing page?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              const studentId = currentStudent?.id;
              if (studentId) {
                await StudentRepository.cancelRegistration(String(studentId)).catch(() => undefined);
              }
              await Promise.allSettled([
                appStorage.deleteItem(STORAGE_KEYS.participationToken),
                appStorage.deleteItem(STORAGE_KEYS.examinationCode),
                appStorage.deleteItem(STORAGE_KEYS.studentProgress),
                appStorage.deleteItem(STORAGE_KEYS.examCheckpoint),
                appStorage.deleteItem('tcc.student.preload.ready'),
                PeerExamClient.clear(),
              ]);
              useStudentStore.getState().reset();
              useExamStore.getState().reset();
              useLobbyStore.getState().reset();
            } finally {
              router.replace('/');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title={lobbyData?.schedule?.name || "Entrance Examination"}
        subtitle={isStale ? "Syncing Connection..." : "Secure Student Dashboard"}
        onBack={handleExit}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* SECTION 1: IDENTITY & READINESS */}
        <Card style={styles.mainCard}>
           <View style={styles.studentSection}>
              <View style={styles.avatarCircle}>
                 <User size={24} color={colors.white} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                 <Text style={styles.welcomeText} numberOfLines={1}>Hello, {currentStudent?.fullName || 'Student'}</Text>
                 <Text style={styles.programText}>{currentStudent?.programName || 'Candidate'}</Text>
              </View>
           </View>

           {/* HARDCODED GREEN STATUS - As requested, the pack is already downloaded at home */}
           <View style={[styles.readinessBanner, styles.readyBg]}>
              <Check size={18} color={colors.success} />
              <Text style={[styles.readinessText, styles.readyText]}>
                 Ready for Offline Exam
              </Text>
           </View>
        </Card>

        {/* SECTION 2: EXAM DETAILS */}
        <Card style={styles.infoCard}>
           {(!isStale && lobbyData) ? (
              <View style={styles.infoGrid}>
                  <InfoItem label="Batch" value={lobbyData?.session?.batchNumber || "—"} />
                  <InfoItem label="Time" value={lobbyData?.session?.timeLabel || "—"} />
                  <InfoItem label="Room" value={lobbyData?.session?.roomName || lobbyData?.session?.venue || "TBD"} />
              </View>
           ) : (
              <View style={{ padding: 16 }}>
                 <Text style={styles.loadingInfo}>
                    {isStale ? "Reconnecting to Room..." : "Syncing room details..."}
                 </Text>
                 <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
              </View>
           )}
        </Card>

        {/* SECTION 3: WAITING STATUS BANNER */}
        <Card style={styles.waitingCard}>
          <View style={styles.waitingBannerRow}>
            <View style={styles.waitingAnimWrap}>
              <ActivityIndicator size="small" color="#0055A4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.waitingBannerTitle}>
                {controller.state === 'STARTING' ? 'Entry Authorized!' : 'Waiting for Proctor to Start...'}
              </Text>
              <Text style={styles.waitingBannerSub}>
                {controller.state === 'STARTING'
                  ? 'Launching examination browser. Please hold on.'
                  : 'The test opens automatically. Please read the regulations below.'}
              </Text>
            </View>
          </View>

          {controller.state === 'STARTING' && (
            <View style={styles.startingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.startingText}>Launching Exam Browser...</Text>
            </View>
          )}
        </Card>

        {/* SECTION 4: RULES & REGULATIONS (Exactly matches Proctor Dashboard) */}
        <Card style={styles.rulesCard}>
          <View style={styles.rulesHeader}>
            <View style={styles.rulesIconWrap}>
              <ShieldCheck size={20} color="#0055A4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rulesTitle}>Rules & Regulations</Text>
              <Text style={styles.rulesSubtitle}>
                Proctoring Standards & Examinee Guidelines
              </Text>
            </View>
          </View>

          <View style={styles.rulesList}>
            <View style={styles.ruleRow}>
              <Text style={styles.ruleBullet}>•</Text>
              <Text style={styles.ruleText}>
                <Text style={styles.ruleBold}>Verification: </Text>
                Examinees must scan proctor QR code or enter verified 6-digit access code.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={styles.ruleBullet}>•</Text>
              <Text style={styles.ruleText}>
                <Text style={styles.ruleBold}>Strict No-Device Policy: </Text>
                Smartphones, smartwatches, and unauthorized electronics are prohibited.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={styles.ruleBullet}>•</Text>
              <Text style={styles.ruleText}>
                <Text style={styles.ruleBold}>Duration & Timer: </Text>
                Session is strictly timed; auto-submits when countdown reaches 00:00.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={styles.ruleBullet}>•</Text>
              <Text style={styles.ruleText}>
                <Text style={styles.ruleBold}>Passing Standard: </Text>
                Minimum qualifying score is 75.0%.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={styles.ruleBullet}>•</Text>
              <Text style={styles.ruleText}>
                <Text style={styles.ruleBold}>Disconnection: </Text>
                Examinees can resume disconnected sessions via Proctor PIN without data loss.
              </Text>
            </View>
          </View>
        </Card>

        {/* SECTION 4: NETWORK HEALTH */}
        <View style={styles.networkBox}>
           <View style={[styles.pulse, { backgroundColor: (controller.lobbyQuery.isError || isStale) ? colors.danger : colors.success }]} />
           <Text style={styles.networkText}>
              {(controller.lobbyQuery.isError || isStale) ? "Signal Interrupted" : `LOCAL LINK ACTIVE · PULSE ${new Date(controller.lastSeen).toLocaleTimeString()}`}
           </Text>
           <Pressable onPress={() => void controller.lobbyQuery.refetch()} style={styles.refreshBtn}>
              <RefreshCw size={14} color={colors.primary} />
           </Pressable>
        </View>

        <Button
          title="Exit Examination"
          variant="outline"
          size="sm"
          onPress={handleExit}
          style={styles.exitBtn}
        />
      </ScrollView>
    </View>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  mainCard: { padding: 16 },
  studentSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  welcomeText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  programText: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500' },
  readinessBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginVertical: 8 },
  readyBg: { backgroundColor: '#DCFCE7' },
  readinessText: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
  readyText: { color: colors.success },
  infoCard: { marginTop: 12, padding: 0, overflow: 'hidden' },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  infoItem: { alignItems: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '800', color: colors.inkMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: colors.ink, marginTop: 2 },
  waitingCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  waitingBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waitingAnimWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EBF3FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#003366',
  },
  waitingBannerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
    lineHeight: 15,
  },
  startingBox: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  startingText: { fontSize: 14, fontWeight: '700', color: colors.primary, marginLeft: 8 },
  networkBox: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  networkText: { fontSize: 10, fontWeight: '700', color: colors.inkMuted, flex: 1 },
  refreshBtn: { padding: 4 },
  exitBtn: { marginTop: 16 },
  loadingInfo: { fontSize: 13, color: colors.inkMuted, fontStyle: 'italic', textAlign: 'center' },
  crashWrap: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 40 },
  crashTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 12 },

  // RULES & REGULATIONS STYLES
  rulesCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rulesIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EBF3FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003366',
  },
  rulesSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  rulesList: {
    gap: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  ruleBullet: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0055A4',
    lineHeight: 18,
  },
  ruleText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
  },
  ruleBold: {
    fontWeight: '700',
    color: '#003366',
  },
});
