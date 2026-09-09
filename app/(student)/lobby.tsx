import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Alert, BackHandler, ScrollView, Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Check, User, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLobby } from '@/hooks/useRepositories';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';
import { LobbyRepository, StudentRepository } from '@/repositories';
import { useExamStore, useLobbyStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';
import { PeerExamClient } from '@/services/peerExamClient';
import { ExamPreloader } from '@/services/examPreloader';
import {
  ExamLifecycle,
  type AuthorityStatus,
} from '@/services/examLifecycle';
import {
  STUDENT_MONITOR_INTERVAL_MS,
  parseStartPulse,
  shouldNavigateToExam,
} from '@/services/examStartCoordinator';
import {
  INITIAL_PACK_PROGRESS,
  userFacingStartupError,
  validateExamStartup,
  type ExamPackProgress,
} from '@/services/examReadiness';

/**
 * DETERMINISTIC LOBBY STATES
 */
type LobbyState = 'DASHBOARD' | 'STARTING' | 'FINISHING_DOWNLOAD' | 'ERROR';

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
  const [progress, setProgress] = useState<ExamPackProgress>(INITIAL_PACK_PROGRESS);
  const [authority, setAuthority] = useState<AuthorityStatus>('WAITING');
  const [lastPulseAt, setLastPulseAt] = useState<number>(Date.now());
  const [pulseOk, setPulseOk] = useState(true);

  const hasJoined = useRef(false);
  const hasEntered = useRef(false);
  const downloading = useRef(false);
  const entering = useRef(false);
  const ackedReceived = useRef(false);

  // Room details come from the join snapshot. Do not poll GET /lobby — that path
  // fails on expo-http-server and starves the start signal.
  const lobbyQuery = useLobby(scannedSessionId ?? undefined, undefined, false);

  const isStale = Date.now() - lastPulseAt > 15000 || !pulseOk;

  const lobbyData = useMemo(() => {
    const raw = lobbyQuery.data ?? storedSnapshot;
    if (!raw) return raw;
    if (authority === 'ACTIVE' && raw.status === 'lobby_open') {
      return { ...raw, status: 'in_progress' as const };
    }
    if (authority === 'ENDED' && raw.status !== 'ended') {
      return { ...raw, status: 'ended' as const };
    }
    return raw;
  }, [lobbyQuery.data, storedSnapshot, authority]);

  useEffect(() => ExamPreloader.subscribe(setProgress), []);

  useEffect(() => {
    const status = storedSnapshot?.status;
    if (status === 'in_progress' || status === 'ended') {
      void applyLiveStatus(status);
    }
  }, [storedSnapshot?.status, applyLiveStatus]);

  const ensurePackDownload = useCallback(async () => {
    if (!scannedSessionId || downloading.current) return;
    downloading.current = true;
    try {
      const snapshot = await ExamPreloader.getReadinessSnapshot();
      if (snapshot.moduleReady && snapshot.hashVerified && snapshot.percent >= 100) {
        return;
      }
      await ExamPreloader.preloadQuestions(scannedSessionId);
    } catch (preloadErr) {
      console.warn('[STARTUP] Download failed:', preloadErr);
    } finally {
      downloading.current = false;
    }
  }, [scannedSessionId]);

  useEffect(() => {
    void ensurePackDownload();
  }, [ensurePackDownload]);

  const applyLiveStatus = useCallback(async (roomStatus?: string | null, startSeq?: number) => {
    const record = await ExamLifecycle.applyFromServer(roomStatus, {
      sessionId: scannedSessionId ?? undefined,
      startSeq,
    });
    setAuthority(record.status);
    return record.status;
  }, [scannedSessionId]);

  useEffect(() => {
    void ExamLifecycle.hydrate();
    return ExamLifecycle.subscribe((record) => setAuthority(record.status));
  }, []);

  // One in-flight start poll. Heartbeat also keeps the proctor last-seen alive.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const checkSignal = async () => {
      if (inFlight || cancelled || hasEntered.current) return;
      inFlight = true;
      try {
        let beat = await LobbyRepository.sendHeartbeat();
        let pulse = parseStartPulse(beat);
        if (!beat.ok || !pulse) {
          const global = await PeerExamClient.getGlobalStatus();
          if (global?.roomStatus) {
            beat = {
              ok: true,
              status: global.roomStatus,
              roomStatus: global.roomStatus,
              authorityStatus: global.authorityStatus,
              startSeq: global.startSeq,
            };
            pulse = parseStartPulse(beat);
          }
        }
        if (cancelled) return;
        if (beat.ok && pulse) {
          setPulseOk(true);
          setLastPulseAt(Date.now());
          setLastSeen(Date.now());
          console.log('[STUDENT] Pulse', pulse.roomStatus, pulse.authorityStatus ?? '');
          const next = await applyLiveStatus(pulse.roomStatus, pulse.startSeq);
          if (next === 'ACTIVE') {
            console.log('[STUDENT] ACTIVE Received');
            if (!ackedReceived.current) {
              ackedReceived.current = true;
              void LobbyRepository.acknowledgeStart('received');
            }
          }
          return;
        }
        setPulseOk(false);
      } finally {
        inFlight = false;
      }
    };

    void checkSignal();
    const id = setInterval(checkSignal, STUDENT_MONITOR_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [applyLiveStatus]);

  const enterExamination = useCallback(async () => {
    if (hasEntered.current || entering.current || !scannedSessionId) return;
    if (authority === 'ENDED') return;
    if (authority !== 'ACTIVE') return;

    if (!progress.moduleReady || !progress.hashVerified || progress.percent < 100) {
      setState('FINISHING_DOWNLOAD');
      void ensurePackDownload();
      return;
    }

    entering.current = true;
    hasEntered.current = true;
    setState('STARTING');
    try {
      console.log('[STUDENT] Loading Exam Module');
      const questions = await ExamPreloader.getPreloadedQuestions();
      if (!questions?.length) {
        throw new Error(
          userFacingStartupError(
            progress.percent > 0 ? 'DOWNLOAD_INCOMPLETE' : 'PACK_MISSING',
            'The local examination module is not ready.',
          ),
        );
      }

      const duration =
        (await ExamPreloader.getCachedDuration()) ||
        lobbyData?.session?.durationMinutes ||
        90;
      const settings = await ExamPreloader.getCachedSettings();
      const examId =
        lobbyData?.session?.id ||
        lobbyData?.schedule?.id ||
        scannedSessionId;

      const gate = validateExamStartup({
        sessionId: scannedSessionId,
        examId,
        questions,
        durationMinutes: duration,
        hasSettings: Boolean(settings) || progress.configurationComplete,
        sessionStatus: 'in_progress',
        authorityStatus: 'ACTIVE',
        progress: { ...progress, questionsDownloaded: questions.length },
      });
      if (!gate.ok) {
        throw new Error(userFacingStartupError(gate.code, gate.detail));
      }

      console.log('[STUDENT] Navigation Triggered');
      setSessionId(scannedSessionId);
      setQuestions(questions);
      startExam(duration);
      await ExamLifecycle.apply('ACTIVE', { sessionId: scannedSessionId });
      void LobbyRepository.acknowledgeStart('entered');
      router.replace('/(student)/exam');
    } catch (err) {
      console.error('[STUDENT] ENTRY_CRASH:', err);
      hasEntered.current = false;
      entering.current = false;
      setState(progress.moduleReady ? 'DASHBOARD' : 'FINISHING_DOWNLOAD');
      Alert.alert(
        'Could not open examination',
        err instanceof Error ? err.message : 'Stay connected to the examination Wi‑Fi and try again.',
      );
    }
  }, [
    authority,
    scannedSessionId,
    progress,
    lobbyData,
    ensurePackDownload,
    router,
    setQuestions,
    setSessionId,
    startExam,
  ]);

  useEffect(() => {
    if (authority === 'ENDED') {
      setState('ERROR');
      setError('Examination Ended');
      return;
    }
    if (
      !shouldNavigateToExam({
        authority,
        moduleReady: progress.moduleReady,
        hashVerified: progress.hashVerified,
        percent: progress.percent,
        alreadyEntered: hasEntered.current,
      })
    ) {
      if (authority === 'ACTIVE' && !hasEntered.current) {
        setState('FINISHING_DOWNLOAD');
        void ensurePackDownload();
      }
      return;
    }
    void enterExamination();
  }, [authority, progress.moduleReady, progress.hashVerified, progress.percent, enterExamination]);

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
            if (lobby.status === 'in_progress' || lobby.status === 'ended') {
              await applyLiveStatus(lobby.status);
            }

            void ensurePackDownload();
        } catch (e) {
            console.warn("Lobby handshake delay...", e);
            hasJoined.current = false;
        }
    }
  }, [scannedSessionId, verifiedStudent, selectedStudent, examPasskey, router, setVerifiedStudent, setSnapshot, ensurePackDownload, applyLiveStatus]);

  useEffect(() => { void initializeAndJoin(); }, [initializeAndJoin]);

  return {
    state,
    error,
    currentStudent: verifiedStudent || selectedStudent,
    lobbyData,
    lastSeen,
    isStale,
    lobbyQuery,
    progress,
    authority,
    pulseOk,
  };
}

export default function StudentLobbyScreen() {
  useKeepAwake();
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

  const { lobbyData, currentStudent, isStale, progress, authority, pulseOk } = controller;
  const sessionLabel =
    authority === 'ACTIVE' || authority === 'STARTING'
      ? 'Active'
      : authority === 'ENDED'
        ? 'Ended'
        : authority === 'PAUSED'
          ? 'Paused'
          : 'Waiting';
  const networkConnected = pulseOk && !isStale;
  const examReady = Boolean(progress.moduleReady && progress.hashVerified && progress.percent >= 100);

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
                ExamLifecycle.clear(),
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

           <View style={[styles.readinessBanner, examReady ? styles.readyBg : styles.progressBg]}>
              {examReady ? <Check size={18} color={colors.success} /> : <ActivityIndicator size="small" color={colors.primary} />}
              <Text style={[styles.readinessText, examReady ? styles.readyText : styles.progressText]}>
                 {controller.state === 'FINISHING_DOWNLOAD'
                   ? `Finishing Download...\n${Math.round(progress.percent)}%`
                   : progress.phaseLabel}
              </Text>
           </View>
        </Card>

        <Card style={styles.readinessCard}>
          <Text style={styles.readinessCardTitle}>Exam Readiness</Text>
          <ReadinessRow label="Module Download" value={`${Math.round(progress.percent)}%`} ok={progress.percent >= 100} />
          <ReadinessRow
            label="Questions"
            value={`${progress.questionsDownloaded}/${progress.questionsExpected || progress.questionsDownloaded || 0}`}
            ok={progress.questionsDownloaded > 0}
          />
          <ReadinessRow label="Verification" value={progress.hashVerified ? 'Passed' : 'Pending'} ok={progress.hashVerified} />
          <ReadinessRow label="Session" value={sessionLabel} ok={sessionLabel === 'Active' || sessionLabel === 'Waiting'} />
          <ReadinessRow label="Network" value={networkConnected ? 'Connected' : 'Interrupted'} ok={networkConnected} />
          <ReadinessRow label="Ready" value={examReady ? 'YES' : 'NO'} ok={examReady} />
        </Card>

        <Card style={styles.readinessCard}>
          <Text style={styles.readinessCardTitle}>Downloaded Files</Text>
          <ReadinessRow
            label="Questions"
            value={`${progress.questionsDownloaded}/${progress.questionsExpected || progress.questionsDownloaded || 0}`}
            ok={progress.questionsDownloaded > 0}
          />
          <ReadinessRow
            label="Assets"
            value={`${progress.assetsDownloaded}/${progress.assetsExpected || progress.assetsDownloaded || 0}`}
            ok={progress.assetsDownloaded >= (progress.assetsExpected || 0)}
          />
          <ReadinessRow
            label="Configuration"
            value={progress.configurationComplete ? 'Complete' : 'Missing'}
            ok={progress.configurationComplete}
          />
          <ReadinessRow label="Hash" value={progress.hashVerified ? 'Verified' : 'Pending'} ok={progress.hashVerified} />
          <ReadinessRow
            label="Status"
            value={examReady ? 'Ready' : progress.phase === 'error' ? 'Incomplete' : 'Downloading'}
            ok={examReady}
          />
        </Card>

        {/* SECTION 2: EXAM DETAILS */}
        <Card style={styles.infoCard}>
           {lobbyData ? (
              <View style={styles.infoGrid}>
                  <InfoItem label="Batch" value={lobbyData?.session?.batchNumber || "—"} />
                  <InfoItem label="Time" value={lobbyData?.session?.timeLabel || "—"} />
                  <InfoItem label="Room" value={lobbyData?.session?.roomName || lobbyData?.session?.venue || "TBD"} />
              </View>
           ) : (
              <View style={{ padding: 16 }}>
                 <Text style={styles.loadingInfo}>Room details loaded from the join snapshot.</Text>
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
                {authority === 'ENDED'
                  ? 'Examination Ended'
                  : controller.state === 'STARTING' || authority === 'ACTIVE'
                    ? 'Entry Authorized!'
                    : controller.state === 'FINISHING_DOWNLOAD'
                      ? 'Finishing Download...'
                      : 'Waiting for Proctor to Start...'}
              </Text>
              <Text style={styles.waitingBannerSub}>
                {authority === 'ENDED'
                  ? 'This examination has ended. You cannot enter the waiting lobby again.'
                  : controller.state === 'STARTING' || authority === 'ACTIVE'
                    ? 'Launching examination browser. Please hold on.'
                    : controller.state === 'FINISHING_DOWNLOAD'
                      ? `The proctor has started the exam. Completing download at ${Math.round(progress.percent)}%.`
                      : 'The test opens automatically after the pack is verified and the proctor starts.'}
              </Text>
            </View>
          </View>

          {(controller.state === 'STARTING' || controller.state === 'FINISHING_DOWNLOAD') && (
            <View style={styles.startingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.startingText}>
                {controller.state === 'FINISHING_DOWNLOAD'
                  ? `Finishing Download... ${Math.round(progress.percent)}%`
                  : 'Launching Exam Browser...'}
              </Text>
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

function ReadinessRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.readinessRow}>
      <Text style={styles.readinessRowLabel}>{label}</Text>
      <Text style={[styles.readinessRowValue, ok ? styles.readyText : styles.pendingText]}>{value}</Text>
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
  progressBg: { backgroundColor: '#E0F2FE' },
  readinessText: { fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },
  readyText: { color: colors.success },
  progressText: { color: '#0369A1' },
  pendingText: { color: '#B45309' },
  readinessCard: { marginTop: 12, padding: 14 },
  readinessCardTitle: { fontSize: 13, fontWeight: '800', color: '#003366', marginBottom: 8 },
  readinessRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  readinessRowLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  readinessRowValue: { fontSize: 12, fontWeight: '800', color: colors.ink },
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
