import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Alert, BackHandler, ScrollView, Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Check, User, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { Header } from '@/shared/components/ui/Header';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useLobby } from '@/features/lobby/hooks/useLobby';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { StudentRepository } from '@/features/applicants/repositories/StudentRepository';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { colors } from '@/shared/theme';
import { EXAM_PROCESS_STEPS, examProcess } from '@/shared/theme/examProcess';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import {
  ExamLifecycle,
  type AuthorityStatus,
} from '@/features/examinations/services/examLifecycle';
import {
  STUDENT_MONITOR_INTERVAL_MS,
  parseStartPulse,
  shouldNavigateToExam,
} from '@/features/examinations/services/examStartCoordinator';
import {
  INITIAL_PACK_PROGRESS,
  userFacingStartupError,
  validateExamStartup,
  type ExamPackProgress,
} from '@/features/examinations/services/examReadiness';

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
    // Never override a live lobby_open with stale local ACTIVE — that skipped
    // the proctor Start wait for later batches on shared devices.
    if (authority === 'ENDED' && raw.status !== 'ended') {
      return { ...raw, status: 'ended' as const };
    }
    return raw;
  }, [lobbyQuery.data, storedSnapshot, authority]);

  useEffect(() => ExamPreloader.subscribe(setProgress), []);

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
    const status = storedSnapshot?.status;
    if (status === 'in_progress' || status === 'ended') {
      void applyLiveStatus(status);
    }
  }, [storedSnapshot?.status, applyLiveStatus]);

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
        // Proctor may have ended/closed the room while this student was away.
        const health = await PeerExamClient.probeHealth();
        if (!cancelled && (health === 'ended' || health === 'idle')) {
          await applyLiveStatus('ended');
          setPulseOk(false);
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
            if (lobby.status === 'lobby_open') {
              await applyLiveStatus('lobby_open');
            } else if (lobby.status === 'in_progress' || lobby.status === 'ended') {
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
    const leave = async () => {
      try {
        const studentId = currentStudent?.id;
        if (studentId && authority !== 'ENDED') {
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
        try {
          const { clearApplicantExamMaterial } = await import(
            '@/features/applicants/services/applicantExamCleanup'
          );
          await clearApplicantExamMaterial();
        } catch {
          /* ignore */
        }
        useStudentStore.getState().reset();
        useExamStore.getState().reset();
        useLobbyStore.getState().reset();
      } finally {
        router.replace('/');
      }
    };

    if (authority === 'ENDED') {
      void leave();
      return;
    }

    Alert.alert(
      'Exit Examination',
      'Are you sure you want to leave the examination lobby and return to the main landing page?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => void leave(),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.processHeader}>
        <View style={styles.progress}>
          {EXAM_PROCESS_STEPS.map((label, index) => (
            <View
              key={label}
              style={[styles.progressSeg, index <= 3 && styles.progressSegOn]}
            />
          ))}
        </View>
        <Text style={styles.stepLabel}>Step 4 of 6 · Lobby</Text>
      </View>
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
              {examReady ? <Check size={18} color={examProcess.okText} /> : <ActivityIndicator size="small" color={examProcess.accent} />}
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
              <ActivityIndicator size="small" color={examProcess.accent} />
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
                  ? 'This examination has ended. Tap Return Home to leave.'
                  : controller.state === 'STARTING' || authority === 'ACTIVE'
                    ? 'Launching examination browser. Please hold on.'
                    : controller.state === 'FINISHING_DOWNLOAD'
                      ? `The proctor has started the exam. Completing download at ${Math.round(progress.percent)}%.`
                      : 'The test opens automatically after the pack is verified and the proctor starts.'}
              </Text>
            </View>
          </View>

          {authority === 'ENDED' ? (
            <View style={styles.startingBox}>
              <Button title="Return Home" onPress={handleExit} />
            </View>
          ) : null}

          {(controller.state === 'STARTING' || controller.state === 'FINISHING_DOWNLOAD') && (
            <View style={styles.startingBox}>
              <ActivityIndicator size="small" color={examProcess.accent} />
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
              <ShieldCheck size={20} color={examProcess.accent} />
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
                Examinees must join with the proctor QR code or room code on the same Join screen.
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
              <RefreshCw size={14} color={examProcess.accent} />
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
  screen: { flex: 1, backgroundColor: examProcess.pageBg },
  processHeader: {
    paddingHorizontal: examProcess.padPage,
    paddingTop: 8,
    gap: 6,
  },
  progress: { flexDirection: 'row', gap: 6 },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: examProcess.radiusProgress,
    backgroundColor: examProcess.progressTrack,
  },
  progressSegOn: { backgroundColor: examProcess.accent },
  stepLabel: { color: examProcess.muted, fontSize: 12, marginBottom: 4 },
  content: { padding: 16, paddingBottom: 40 },
  mainCard: { padding: 16 },
  studentSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: examProcess.accent, alignItems: 'center', justifyContent: 'center' },
  welcomeText: { fontSize: 16, fontWeight: '700', color: examProcess.ink },
  programText: { fontSize: 13, color: examProcess.muted, fontWeight: '500' },
  readinessBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: examProcess.radiusControl, marginVertical: 8 },
  readyBg: { backgroundColor: examProcess.okBg },
  progressBg: { backgroundColor: '#EEF1FD' },
  readinessText: { fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 },
  readyText: { color: examProcess.okText },
  progressText: { color: examProcess.accent },
  pendingText: { color: '#B45309' },
  readinessCard: { marginTop: 12, padding: 14 },
  readinessCardTitle: { fontSize: 13, fontWeight: '800', color: examProcess.ink, marginBottom: 8 },
  readinessRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  readinessRowLabel: { fontSize: 12, fontWeight: '600', color: examProcess.muted },
  readinessRowValue: { fontSize: 12, fontWeight: '800', color: examProcess.ink },
  infoCard: { marginTop: 12, padding: 0, overflow: 'hidden' },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  infoItem: { alignItems: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '800', color: examProcess.muted, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: examProcess.ink, marginTop: 2 },
  waitingCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: examProcess.radiusCard,
    backgroundColor: examProcess.cardBg,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
  },
  waitingBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waitingAnimWrap: {
    width: 36,
    height: 36,
    borderRadius: examProcess.radiusControl,
    backgroundColor: '#EEF1FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: examProcess.ink,
  },
  waitingBannerSub: {
    fontSize: 11,
    color: examProcess.muted,
    marginTop: 2,
    fontWeight: '500',
    lineHeight: 15,
  },
  startingBox: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: examProcess.cardBorder },
  startingText: { fontSize: 14, fontWeight: '700', color: examProcess.accent, marginLeft: 8 },
  networkBox: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: examProcess.cardBg, borderRadius: examProcess.radiusCard, borderWidth: 1, borderColor: examProcess.cardBorder, marginTop: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  networkText: { fontSize: 10, fontWeight: '700', color: examProcess.muted, flex: 1 },
  refreshBtn: { padding: 4 },
  exitBtn: { marginTop: 16 },
  loadingInfo: { fontSize: 13, color: examProcess.muted, fontStyle: 'italic', textAlign: 'center' },
  crashWrap: { flex: 1, backgroundColor: examProcess.pageBg, alignItems: 'center', justifyContent: 'center', padding: 40 },
  crashTitle: { fontSize: 20, fontWeight: '800', color: examProcess.ink, marginBottom: 12 },

  // RULES & REGULATIONS STYLES
  rulesCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: examProcess.radiusCard,
    backgroundColor: examProcess.cardBg,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: examProcess.cardBorder,
  },
  rulesIconWrap: {
    width: 36,
    height: 36,
    borderRadius: examProcess.radiusControl,
    backgroundColor: '#EEF1FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: examProcess.ink,
  },
  rulesSubtitle: {
    fontSize: 11,
    color: examProcess.muted,
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
    color: examProcess.accent,
    lineHeight: 18,
  },
  ruleText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: examProcess.muted,
  },
  ruleBold: {
    fontWeight: '700',
    color: examProcess.ink,
  },
});
