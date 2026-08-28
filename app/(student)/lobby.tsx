import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Alert, BackHandler, ScrollView, Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Check, User, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LobbyWaitingAnimation } from '@/features/lobby/LobbyWaitingAnimation';
import { useLobby } from '@/hooks/useRepositories';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';
import { QuestionRepository, LobbyRepository } from '@/repositories';
import { useExamStore, useLobbyStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';
import { PeerExamClient } from '@/services/peerExamClient';
import { OfflineStore } from '@/services/offlineStore';

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
            const questions = await QuestionRepository.getQuestions(scannedSessionId!);
            if (!questions.length) throw new Error('No questions found in module');

            setSessionId(scannedSessionId!);
            setQuestions(questions);
            startExam(lobbyData.session?.durationMinutes || 90);

            console.log('[LOBBY_CTL] NAVIGATING_TO_EXAM_SCREEN');
            router.replace('/(student)/exam');
        } catch (err) {
            console.error('[LOBBY_CTL] ENTRY_CRASH:', err);
            hasEntered.current = false;
            setState('DASHBOARD');
            Alert.alert('Load Failure', 'Could not open examination. Ensure modules were downloaded at the start.');
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

  return (
    <View style={styles.screen}>
      <Header
        title={lobbyData?.schedule?.name || "Entrance Examination"}
        subtitle={isStale ? "Syncing Connection..." : "Secure Student Dashboard"}
        onBack={undefined}
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

        {/* SECTION 3: SIGNAL AREA */}
        <View style={styles.waitingArea}>
            <LobbyWaitingAnimation />
            <Text style={styles.waitingTitle}>
               {controller.state === 'STARTING' ? "Entry Authorized!" : "Waiting for Proctor..."}
            </Text>
            <Text style={styles.waitingSub}>
               The exam opens automatically. Keep this screen visible and stay on the Wi-Fi.
            </Text>

            {controller.state === 'STARTING' && (
                <View style={styles.startingBox}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.startingText}>Launching Exam Browser...</Text>
                </View>
            )}
        </View>

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
          title="Exit Dashboard"
          variant="outline"
          size="sm"
          onPress={() => router.replace('/')}
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
  waitingArea: { alignItems: 'center', paddingVertical: 40 },
  waitingTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 12 },
  waitingSub: { fontSize: 13, color: colors.inkSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },
  startingBox: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  startingText: { fontSize: 14, fontWeight: '700', color: colors.primary, marginLeft: 8 },
  networkBox: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  networkText: { fontSize: 10, fontWeight: '700', color: colors.inkMuted, flex: 1 },
  refreshBtn: { padding: 4 },
  exitBtn: { marginTop: 16 },
  loadingInfo: { fontSize: 13, color: colors.inkMuted, fontStyle: 'italic', textAlign: 'center' },
  crashWrap: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 40 },
  crashTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 12 },
});
