import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Alert, BackHandler, ScrollView, Text, View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { User, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { Header } from '@/shared/components/ui/Header';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { useLobby } from '@/features/lobby/hooks/useLobby';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { releaseExamSessionRestrictions } from '@/features/examinations/services/examSessionRestrictions';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { colors } from '@/shared/theme';
import type { Question } from '@/shared/types';
import { useExamProcess, examProcess } from '@/shared/theme/examProcess';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { ExamProcessStepper } from '@/features/examinations/components/ExamProcessStepper';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import { userFacingError } from '@/shared/utils/userFacingError';
import { useGuidedAccessStatus } from '@/features/examinations/hooks/useGuidedAccessStatus';
import { requireGuidedAccess } from '@/features/examinations/services/guidedAccess';
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
import {
  buildStudentExamPaperFromQuestions,
  type ChoiceDisplayMap,
} from '@/features/synchronization/services/offlineExamRepository';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { usePeerAutoReconnect } from '@/features/monitoring/hooks/usePeerAutoReconnect';
import { PracticeModeChip } from '@/features/practice/components/PracticeModeChip';
import type { PracticeApplicant } from '@/features/practice/practiceTypes';
import { usePracticeStore } from '@/features/practice/practiceStore';
import { usePracticeTutorialTarget } from '@/features/practice/components/PracticeTutorialProvider';

/**
 * DETERMINISTIC LOBBY STATES
 */
type LobbyState = 'DASHBOARD' | 'STARTING' | 'FINISHING_DOWNLOAD' | 'ERROR';

function useLobbyController() {
  const router = useRouter();
  const [guidedAccess] = useGuidedAccessStatus();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const storedSnapshot = useLobbyStore((s) => s.snapshot);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const setQuestions = useExamStore((s) => s.setQuestions);
  const setSessionId = useExamStore((s) => s.setSessionId);
  const startExam = useExamStore((s) => s.startExam);

  const [state, setState] = useState<LobbyState>('DASHBOARD');
  const [error, setError] = useState<string | null>(null);
  const [packDownloadError, setPackDownloadError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<number>(Date.now());
  const [progress, setProgress] = useState<ExamPackProgress>(INITIAL_PACK_PROGRESS);
  const [authority, setAuthority] = useState<AuthorityStatus>('WAITING');
  const [lastPulseAt, setLastPulseAt] = useState<number>(Date.now());
  const [pulseOk, setPulseOk] = useState(true);
  const [durableParticipation, setDurableParticipation] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'declined'>('pending');
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null);

  const hasEntered = useRef(false);
  const downloading = useRef(false);
  const entering = useRef(false);
  const ackedReceived = useRef(false);
  const isRemovedRef = useRef(false);

  // Zustand stores are process memory only. Hydrate the durable participation
  // marker before route guards run, otherwise a cold restart briefly appears
  // unregistered and redirects lobby -> confirmation -> passkey -> welcome.
  useEffect(() => {
    let cancelled = false;
    if (!scannedSessionId) {
      setHydratedSessionId(null);
      setDurableParticipation(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      let progressSessionId: string | null = null;
      try {
        const raw = await appStorage.getItem(STORAGE_KEYS.studentProgress);
        progressSessionId = raw ? String((JSON.parse(raw) as { sessionId?: string }).sessionId ?? '') : null;
      } catch {
        progressSessionId = null;
      }
      if (cancelled) return;

      const hasDurableSession = Boolean(token && progressSessionId === String(scannedSessionId));
      setDurableParticipation(hasDurableSession);
      if (hasDurableSession && !storedSnapshot) {
        const snapshot = await LobbyRepository.getLobby(scannedSessionId).catch(() => null);
        if (!cancelled && snapshot) setSnapshot(snapshot);
      }
      if (!cancelled) setHydratedSessionId(String(scannedSessionId));
    })();

    return () => {
      cancelled = true;
    };
  }, [scannedSessionId, storedSnapshot, setSnapshot]);

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
    setPackDownloadError(null);
    try {
      const snapshot = await ExamPreloader.getReadinessSnapshot();
      if (snapshot.moduleReady && snapshot.hashVerified && snapshot.percent >= 100) {
        return;
      }
      const result = await ExamPreloader.preloadQuestions(scannedSessionId);
      if (result.count <= 0) {
        throw new Error('The examination pack did not include any questions. Ask the proctor to refresh the pack and retry.');
      }
    } catch (preloadErr) {
      console.warn('[STARTUP] Examination pack download failed:', {
        errorName: preloadErr instanceof Error ? preloadErr.name : 'UnknownError',
      });
      setPackDownloadError(
        userFacingError(
          preloadErr,
          "Unable to receive the examination pack from the proctor. Check the local Wi-Fi connection and retry.",
        ),
      );
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

  const handleAutoReconnected = useCallback(async (pulse: Awaited<ReturnType<typeof LobbyRepository.sendHeartbeat>>) => {
    if (pulse.approvalStatus) setApprovalStatus(pulse.approvalStatus);
    setPulseOk(true);
    setLastPulseAt(Date.now());
    setLastSeen(Date.now());
    const parsed = parseStartPulse(pulse);
    if (parsed) await applyLiveStatus(parsed.roomStatus, parsed.startSeq);
  }, [applyLiveStatus]);

  const { networkBanner } = usePeerAutoReconnect({
    enabled: Boolean(scannedSessionId),
    onReconnected: handleAutoReconnected,
  });

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
      if (inFlight || cancelled || hasEntered.current || isRemovedRef.current) return;
      inFlight = true;
      try {
        let beat = await LobbyRepository.sendHeartbeat();
        if (beat.approvalStatus) setApprovalStatus(beat.approvalStatus);

        // REAL-TIME REMOVAL EVENT: proctor kicked or terminated examinee
        if (
          beat.removed ||
          beat.myStatus === 'terminated' ||
          beat.status === 'terminated' ||
          beat.roomStatus === 'terminated'
        ) {
          if (isRemovedRef.current) return;
          isRemovedRef.current = true;
          cancelled = true;
          await appStorage.deleteItem(STORAGE_KEYS.participationToken);
          Alert.alert(
            'Session Removed',
            'You have been removed from this session.',
            [
              {
                text: 'OK',
                onPress: () => {
                  router.replace('/' as any);
                },
              },
            ],
            { cancelable: false },
          );
          return;
        }

        let pulse = parseStartPulse(beat);
        if (!beat.ok || !pulse) {
          // If explicit removal was returned, do not let global status overwrite
          if (
            beat.message?.toLowerCase().includes('removed') ||
            beat.message?.toLowerCase().includes('terminated') ||
            beat.message?.toLowerCase().includes('no longer joined')
          ) {
            if (isRemovedRef.current) return;
            isRemovedRef.current = true;
            cancelled = true;
            await appStorage.deleteItem(STORAGE_KEYS.participationToken);
            Alert.alert(
              'Session Removed',
              'You have been removed from this session.',
              [{ text: 'OK', onPress: () => router.replace('/' as any) }],
              { cancelable: false },
            );
            return;
          }

          const global = await PeerExamClient.getGlobalStatus();
          if ((global as any)?.removed || (global as any)?.myStatus === 'terminated') {
            if (isRemovedRef.current) return;
            isRemovedRef.current = true;
            cancelled = true;
            await appStorage.deleteItem(STORAGE_KEYS.participationToken);
            Alert.alert(
              'Session Removed',
              'You have been removed from this session.',
              [{ text: 'OK', onPress: () => router.replace('/' as any) }],
              { cancelable: false },
            );
            return;
          }

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
        if (cancelled || isRemovedRef.current) return;
        if (beat.ok && pulse) {
          setPulseOk(true);
          setLastPulseAt(Date.now());
          setLastSeen(Date.now());
          console.log('[STUDENT] Pulse', pulse.roomStatus, pulse.authorityStatus ?? '');
          if (beat.approvalStatus && beat.approvalStatus !== 'approved') return;
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
        // Or the proctor changed Wi‑Fi — refresh host IP from cloud before giving up.
        let health = await PeerExamClient.probeHealth();
        if (health === 'unreachable') {
          const refreshed = await PeerExamClient.refreshHostFromCloud();
          if (refreshed) {
            health = await PeerExamClient.probeHealth();
          }
        }
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
  }, [applyLiveStatus, router]);

  const enterExamination = useCallback(async () => {
    if (hasEntered.current || entering.current || !scannedSessionId) return;
    if (guidedAccess !== 'enabled') return;
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
      const canonicalQuestions = await ExamPreloader.getPreloadedQuestions();
      if (!canonicalQuestions?.length) {
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
        questions: canonicalQuestions,
        durationMinutes: duration,
        hasSettings: Boolean(settings) || progress.configurationComplete,
        sessionStatus: 'in_progress',
        authorityStatus: 'ACTIVE',
        progress: { ...progress, questionsDownloaded: canonicalQuestions.length },
      });
      if (!gate.ok) {
        throw new Error(userFacingStartupError(gate.code, gate.detail));
      }

      requireGuidedAccess();
      console.log('[STUDENT] Navigation Triggered');

      // Check if this attempt already has a stable saved sequence in the local checkpoint
      const checkpoint = await ExamProgressStore.load().catch(() => null);
      let questionsToUse: Question[] = canonicalQuestions;
      let choiceMapsToUse: Record<string, ChoiceDisplayMap> = {};

      if (
        checkpoint &&
        checkpoint.sessionId === scannedSessionId &&
        Array.isArray(checkpoint.questionOrder) &&
        checkpoint.questionOrder.length === canonicalQuestions.length
      ) {
        const byId = new Map(canonicalQuestions.map((q) => [q.id, q]));
        const ordered = checkpoint.questionOrder
          .map((id) => byId.get(id))
          .filter((q): q is Question => Boolean(q));
        if (ordered.length === canonicalQuestions.length) {
          questionsToUse = ordered.map((q, index) => {
            const map = checkpoint.choiceMaps?.[q.id];
            if (!map) return { ...q, number: index + 1 };
            const keys = ['A', 'B', 'C', 'D'] as const;
            const choices = { A: '', B: '', C: '', D: '' } as Question['choices'];
            for (const display of keys) {
              const original = map[display] ?? display;
              choices[display] = q.choices[original] ?? '';
            }
            return { ...q, number: index + 1, choices };
          });
          choiceMapsToUse = checkpoint.choiceMaps ?? {};
        }
      } else {
        const studentIdentifier = (
          verifiedStudent?.studentId ||
          verifiedStudent?.id ||
          String(verifiedStudent?.registration_id ?? '')
        ).trim();
        const assignedExamSet = verifiedStudent?.examSet?.trim() || undefined;
        const paper = buildStudentExamPaperFromQuestions(canonicalQuestions, {
          studentIdentifier,
          examSet: assignedExamSet,
          settings: settings ?? undefined,
        });
        questionsToUse = paper.questions;
        choiceMapsToUse = paper.choiceMaps;
      }

      setQuestions(questionsToUse, choiceMapsToUse);
      setSessionId(scannedSessionId);
      const token = await appStorage.getItem(STORAGE_KEYS.participationToken);
      const authoritativeStartedAt = lobbyData?.session?.startedAt || new Date().toISOString();
      const authoritativeDeadline = lobbyData?.session?.endsAt || undefined;
      startExam({
        durationMinutes: duration,
        attemptId: token ?? undefined,
        startedAt: authoritativeStartedAt,
        deadline: authoritativeDeadline,
        serverTime: new Date().toISOString(),
      });
      await ExamLifecycle.apply('ACTIVE', { sessionId: scannedSessionId });
      router.replace('/(student)/exam');
    } catch (err) {
      console.error('[STUDENT] Examination entry failed:', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      hasEntered.current = false;
      entering.current = false;
      setState(progress.moduleReady ? 'DASHBOARD' : 'FINISHING_DOWNLOAD');
      Alert.alert(
        'Could not open examination',
        userFacingError(
          err,
          'Unable to open the examination. Check the local examination Wi-Fi and retry; your saved progress has not been cleared.',
        ),
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
    guidedAccess,
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
  }, [authority, progress.moduleReady, progress.hashVerified, progress.percent, enterExamination, guidedAccess]);

  // Registration is completed on Confirm after agreement and successful pinning.
  useEffect(() => {
    if (hydratedSessionId !== String(scannedSessionId ?? '')) return;
    if (!scannedSessionId || !verifiedStudent || (!storedSnapshot && !durableParticipation)) {
      router.replace('/(student)/confirmation' as any);
    }
  }, [scannedSessionId, verifiedStudent, storedSnapshot, durableParticipation, hydratedSessionId, router]);

  return {
    state,
    error,
    currentStudent: verifiedStudent,
    lobbyData,
    lastSeen,
    isStale,
    lobbyQuery,
    progress,
    packDownloadError,
    retryPackDownload: ensurePackDownload,
    authority,
    pulseOk,
    approvalStatus,
    networkBanner,
  };
}

export default function StudentLobbyScreen() {
  useKeepAwake();
  const tokens = useExamProcess();
  const { isDark } = useThemeTokens();
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

  const { lobbyData, currentStudent, isStale, progress, packDownloadError, authority, pulseOk, approvalStatus } = controller;
  const proctorReconnecting = controller.lobbyQuery.isError || isStale || !pulseOk;
  const examReady = Boolean(progress.moduleReady && progress.hashVerified && progress.percent >= 100);

  const handleExit = () => {
    const leave = async () => {
      try {
        await releaseExamSessionRestrictions('lobby_exit');
      } catch (error) {
        Alert.alert(
          'Unable to release examination restrictions',
          error instanceof Error
            ? error.message
            : 'Use your device system controls to exit app pinning, then try again.',
        );
        return;
      }

      if (authority === 'ENDED') {
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
      }
      router.replace('/');
    };

    if (authority === 'ENDED') {
      void leave();
      return;
    }

    Alert.alert(
      'Exit Examination',
      'Your approved participation, answers, flags, and timer checkpoint will remain saved so you can reconnect. Return to the main landing page?',
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

  const handleDeclinedAdmission = async () => {
    await Promise.allSettled([
      appStorage.deleteItem(STORAGE_KEYS.participationToken),
      appStorage.deleteItem(STORAGE_KEYS.examinationCode),
      PeerExamClient.clear(),
    ]);
    useStudentStore.getState().reset();
    useLobbyStore.getState().reset();
    router.replace('/');
  };

  if (!hasError) {
    return (
      <LobbyRedesign
        controller={controller}
        onExit={handleExit}
        onDeclinedAdmission={handleDeclinedAdmission}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: tokens.pageBg }]}>
      <View style={styles.processHeader}>
        <ExamProcessStepper step={3} />
        <Text style={[styles.stepLabel, { color: tokens.muted }]}>Step 4 of 6 · Lobby</Text>
      </View>
      <Header
        title={lobbyData?.schedule?.name || "Entrance Examination"}
        subtitle={proctorReconnecting ? "Proctor reconnecting..." : "Secure Student Dashboard"}
        onBack={handleExit}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* SECTION 1: IDENTITY */}
        <Card style={styles.mainCard}>
           <View style={styles.studentSection}>
              <View style={[styles.avatarCircle, { backgroundColor: tokens.accent }]}>
                 <User size={24} color={isDark ? tokens.cardBg : '#FFFFFF'} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                 <Text style={[styles.welcomeText, { color: tokens.ink }]} numberOfLines={1}>Hello, {currentStudent?.fullName || 'Student'}</Text>
                 <Text style={[styles.programText, { color: tokens.muted }]}>{currentStudent?.programName || 'Candidate'}</Text>
              </View>
           </View>

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
                 <Text style={[styles.loadingInfo, { color: tokens.muted }]}>Room details loaded from the join snapshot.</Text>
              </View>
           )}
        </Card>

        {/* SECTION 3: WAITING STATUS BANNER */}
        <Card style={styles.waitingCard}>
          <View style={styles.waitingBannerRow}>
            <View style={[styles.waitingAnimWrap, { backgroundColor: tokens.accentSoft }]}>
              {packDownloadError ? (
                <AlertTriangle size={18} color={tokens.error} />
              ) : (
                <ActivityIndicator size="small" color={tokens.accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.waitingBannerTitle, { color: tokens.ink }]}>
                {authority === 'ENDED'
                  ? 'Examination Ended'
                  : proctorReconnecting
                    ? 'Waiting for Proctor Connection'
                  : packDownloadError
                    ? 'Examination pack unavailable'
                   : approvalStatus === 'declined'
                     ? 'Admission Declined'
                   : approvalStatus !== 'approved'
                     ? 'Waiting for Proctor Approval'
                   : controller.state === 'STARTING' || authority === 'ACTIVE'
                    ? 'Entry Authorized!'
                    : controller.state === 'FINISHING_DOWNLOAD'
                      ? 'Finishing Download...'
                      : 'Waiting for Proctor to Start...'}
              </Text>
              <Text style={[styles.waitingBannerSub, { color: tokens.muted }]}>
                {authority === 'ENDED'
                  ? 'This examination has ended. Tap Return Home to leave.'
                  : proctorReconnecting
                    ? 'Your identity, answers, and examination progress remain saved on this phone. Reconnecting automatically over the exam Wi‑Fi.'
                  : packDownloadError
                    ? packDownloadError
                   : approvalStatus === 'declined'
                     ? 'The proctor declined this admission request. You cannot enter this examination room.'
                   : approvalStatus !== 'approved'
                     ? 'Your request was sent. You will be admitted automatically after the proctor approves it.'
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

          {approvalStatus === 'declined' ? (
            <View style={styles.startingBox}>
              <Button title="Return to Join Screen" onPress={() => void handleDeclinedAdmission()} />
            </View>
          ) : null}

          {(controller.state === 'STARTING' || (controller.state === 'FINISHING_DOWNLOAD' && !packDownloadError)) && (
            <View style={styles.startingBox}>
              <ActivityIndicator size="small" color={tokens.accent} />
              <Text style={[styles.startingText, { color: tokens.accent }]}>
                {controller.state === 'FINISHING_DOWNLOAD'
                  ? `Finishing Download... ${Math.round(progress.percent)}%`
                  : 'Launching Exam Browser...'}
              </Text>
            </View>
          )}
          {controller.state === 'FINISHING_DOWNLOAD' && packDownloadError ? (
            <View style={styles.startingBox}>
              <Text style={[styles.startingText, { color: tokens.error }]}>{packDownloadError}</Text>
              <Button title="Retry download" onPress={() => void controller.retryPackDownload()} />
            </View>
          ) : null}
        </Card>

        {/* SECTION 4: RULES & REGULATIONS (Exactly matches Proctor Dashboard) */}
        <Card style={styles.rulesCard}>
          <View style={styles.rulesHeader}>
            <View style={[styles.rulesIconWrap, { backgroundColor: tokens.accentSoft }]}>
              <ShieldCheck size={20} color={tokens.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rulesTitle, { color: tokens.ink }]}>Rules & Regulations</Text>
              <Text style={[styles.rulesSubtitle, { color: tokens.muted }]}>
                Proctoring Standards & Examinee Guidelines
              </Text>
            </View>
          </View>

          <View style={styles.rulesList}>
            <View style={styles.ruleRow}>
              <Text style={[styles.ruleBullet, { color: tokens.accent }]}>•</Text>
              <Text style={[styles.ruleText, { color: tokens.muted }]}>
                <Text style={[styles.ruleBold, { color: tokens.ink }]}>Verification: </Text>
                Examinees must join with the proctor QR code or room code on the same Join screen.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={[styles.ruleBullet, { color: tokens.accent }]}>•</Text>
              <Text style={[styles.ruleText, { color: tokens.muted }]}>
                <Text style={[styles.ruleBold, { color: tokens.ink }]}>Screen Pinning (BYOD): </Text>
                When prompted by Android to &quot;Pin this screen?&quot;, tap &quot;GOT IT&quot;. Do not unpin, minimize, or switch apps during the examination.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={[styles.ruleBullet, { color: tokens.accent }]}>•</Text>
              <Text style={[styles.ruleText, { color: tokens.muted }]}>
                <Text style={[styles.ruleBold, { color: tokens.ink }]}>Unauthorized Devices: </Text>
                Secondary phones, smartwatches, and external electronic aids are strictly prohibited.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={[styles.ruleBullet, { color: tokens.accent }]}>•</Text>
              <Text style={[styles.ruleText, { color: tokens.muted }]}>
                <Text style={[styles.ruleBold, { color: tokens.ink }]}>Duration & Timer: </Text>
                Session is strictly timed; auto-submits when countdown reaches 00:00.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={[styles.ruleBullet, { color: tokens.accent }]}>•</Text>
              <Text style={[styles.ruleText, { color: tokens.muted }]}>
                <Text style={[styles.ruleBold, { color: tokens.ink }]}>Passing Standard: </Text>
                Minimum qualifying score is 75.0%.
              </Text>
            </View>

            <View style={styles.ruleRow}>
              <Text style={[styles.ruleBullet, { color: tokens.accent }]}>•</Text>
              <Text style={[styles.ruleText, { color: tokens.muted }]}>
                <Text style={[styles.ruleBold, { color: tokens.ink }]}>Disconnection: </Text>
                Examinees can resume disconnected sessions via Proctor PIN without data loss.
              </Text>
            </View>
          </View>
        </Card>

        {/* SECTION 4: NETWORK HEALTH */}
        <View style={[styles.networkBox, { backgroundColor: tokens.cardElevated, borderColor: tokens.cardBorder }]}>
           <View style={[styles.pulse, { backgroundColor: (controller.lobbyQuery.isError || isStale) ? tokens.danger : tokens.okText }]} />
           <Text style={[styles.networkText, { color: tokens.muted }]}>
              {proctorReconnecting ? "PROCTOR RECONNECTING · SAVED PROGRESS PRESERVED" : `LOCAL LINK ACTIVE · PULSE ${new Date(controller.lastSeen).toLocaleTimeString()}`}
           </Text>
           <Pressable onPress={() => void controller.lobbyQuery.refetch()} style={styles.refreshBtn}>
              <RefreshCw size={14} color={tokens.accent} />
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
  const tokens = useExamProcess();
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: tokens.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: examProcess.pageBg },
  processHeader: {
    paddingHorizontal: examProcess.padPage,
    paddingTop: 8,
    gap: 4,
  },
  stepLabel: {
    color: examProcess.muted,
    fontSize: 13,
    fontFamily: examProcess.fontRegular,
    marginBottom: 4,
  },
  content: { padding: 16, paddingBottom: 40 },
  mainCard: {
    padding: 16,
    backgroundColor: examProcess.cardBg,
    borderColor: examProcess.cardBorder,
  },
  studentSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: examProcess.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 16,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
  programText: {
    fontSize: 13,
    color: examProcess.muted,
    fontFamily: examProcess.fontRegular,
  },
  readyText: { color: examProcess.okText },
  progressText: { color: examProcess.accent },
  pendingText: { color: '#B45309' },
  infoCard: {
    marginTop: 12,
    padding: 0,
    overflow: 'hidden',
    backgroundColor: examProcess.cardBg,
  },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  infoItem: { alignItems: 'center' },
  infoLabel: {
    fontSize: 10,
    fontFamily: examProcess.fontMedium,
    color: examProcess.muted,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
    marginTop: 2,
  },
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
    backgroundColor: examProcess.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingBannerTitle: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
  waitingBannerSub: {
    fontSize: 12,
    color: examProcess.muted,
    marginTop: 2,
    fontFamily: examProcess.fontRegular,
    lineHeight: 17,
  },
  startingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: examProcess.cardBorder,
  },
  startingText: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
    color: examProcess.accent,
    marginLeft: 8,
  },
  networkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: examProcess.cardElevated,
    borderRadius: examProcess.radiusCard,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    marginTop: 8,
  },
  pulse: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  networkText: {
    fontSize: 11,
    fontFamily: examProcess.fontMedium,
    color: examProcess.muted,
    flex: 1,
  },
  refreshBtn: { padding: 4 },
  exitBtn: { marginTop: 16 },
  loadingInfo: {
    fontSize: 13,
    color: examProcess.muted,
    fontFamily: examProcess.fontRegular,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  crashWrap: {
    flex: 1,
    backgroundColor: examProcess.pageBg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  crashTitle: {
    fontSize: 20,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
    marginBottom: 12,
  },

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
    backgroundColor: examProcess.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesTitle: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
  rulesSubtitle: {
    fontSize: 11,
    color: examProcess.muted,
    fontFamily: examProcess.fontRegular,
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
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.accent,
    lineHeight: 18,
  },
  ruleText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: examProcess.muted,
    fontFamily: examProcess.fontRegular,
  },
  ruleBold: {
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
});

type LobbyControllerSnapshot = ReturnType<typeof useLobbyController>;

export function LobbyRedesign({
  controller: suppliedController,
  onExit,
  onDeclinedAdmission,
  practiceMode = false,
  practiceApplicant,
}: {
  controller?: LobbyControllerSnapshot;
  onExit: () => void;
  onDeclinedAdmission: () => Promise<void>;
  practiceMode?: boolean;
  practiceApplicant?: PracticeApplicant;
}) {
  const theme = useExamineeRedesignTheme();
  const lobbyTutorial = usePracticeTutorialTarget('tutorial-lobby-card');
  const controller = suppliedController ?? createPracticeLobbyController(practiceApplicant);
  const {
    lobbyData,
    currentStudent,
    isStale,
    progress,
    packDownloadError,
    authority,
    pulseOk,
    approvalStatus,
    lastSeen,
    networkBanner,
  } = controller;
  const proctorReconnecting = controller.lobbyQuery.isError || isStale || !pulseOk;
  const examReady = Boolean(progress.moduleReady && progress.hashVerified && progress.percent >= 100);
  const isTerminal = authority === 'ENDED';
  const isDeclined = approvalStatus === 'declined';
  const showWhileWaiting = !isTerminal && !isDeclined;

  let statusTitle = 'Please wait for the proctor to start';
  let statusBody =
    'The exam begins automatically. Your answers stay saved on this phone, and it reconnects on its own if the Wi-Fi drops.\n\nThe test opens automatically after the pack is verified and the proctor starts.';

  if (isTerminal) {
    statusTitle = 'Examination Ended';
    statusBody = controller.error || 'This examination has ended. Tap Return Home to leave.';
  } else if (proctorReconnecting) {
    statusTitle = 'Waiting for Proctor Connection';
    statusBody =
      'Your identity, answers, and examination progress remain saved on this phone. Reconnecting automatically over the exam Wi-Fi.';
  } else if (packDownloadError) {
    statusTitle = 'Examination pack unavailable';
    statusBody = packDownloadError;
  } else if (isDeclined) {
    statusTitle = 'Admission Declined';
    statusBody = 'The proctor declined this admission request. You cannot enter this examination room.';
  } else if (approvalStatus !== 'approved') {
    statusTitle = 'Waiting for Proctor Approval';
    statusBody = 'Your request was sent. You will be admitted automatically after the proctor approves it.';
  } else if (controller.state === 'STARTING' || authority === 'ACTIVE') {
    statusTitle = 'Entry Authorized!';
    statusBody = 'Launching examination browser. Please hold on.';
  } else if (controller.state === 'FINISHING_DOWNLOAD') {
    statusTitle = 'Finishing Download...';
    statusBody = `The proctor has started the exam. Completing download at ${Math.round(progress.percent)}%.`;
  }

  const connectionLabel = isTerminal
    ? 'Examination ended'
    : isDeclined
      ? 'Admission declined'
      : proctorReconnecting
        ? 'Proctor reconnecting'
        : 'Proctor connected';
  const connectionColor = isTerminal || isDeclined || proctorReconnecting ? theme.warningBorder : theme.successText;
  const connectionBackground = isTerminal || isDeclined || proctorReconnecting
    ? theme.warningBackground
    : theme.successBackground;
  const progressPercent = Math.max(0, Math.min(100, Math.round(progress.percent)));

  return (
    <ExamineeRedesignChrome
      step={3}
      title="Waiting Room"
      stepLabel="Step 4 of 6 · Lobby"
      footer={
        <View style={redesignStyles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Leave Waiting Room"
            onPress={onExit}
            style={[redesignStyles.secondaryButton, { backgroundColor: theme.secondaryCard }]}
          >
            <Text style={[redesignStyles.secondaryButtonText, { color: theme.text }]}>Leave Waiting Room</Text>
          </Pressable>
        </View>
      }
    >
      {practiceMode ? <PracticeModeChip /> : null}
      <View
        style={[
          redesignStyles.connectionChip,
          { backgroundColor: connectionBackground },
        ]}
      >
        <View style={[redesignStyles.connectionDot, { backgroundColor: connectionColor }]} />
        <Text style={[redesignStyles.connectionText, { color: connectionColor }]}>{connectionLabel}</Text>
      </View>

      {networkBanner ? (
        <View
          accessibilityRole="alert"
          style={[redesignStyles.networkBanner, { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder }]}
        >
          <Text style={[redesignStyles.networkBannerText, { color: theme.error }]}>{networkBanner}</Text>
        </View>
      ) : null}

      <View style={[redesignStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={redesignStyles.identityRow}>
          <View style={[redesignStyles.avatar, { backgroundColor: theme.primary }]}>
            <User size={25} color={theme.white} />
          </View>
          <View style={redesignStyles.identityCopy}>
            <Text style={[redesignStyles.identityName, { color: theme.text }]} numberOfLines={1}>
              {currentStudent?.fullName || 'Student'}
            </Text>
            <Text style={[redesignStyles.identityProgram, { color: theme.secondaryText }]} numberOfLines={2}>
              {currentStudent?.programName || 'Candidate'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[redesignStyles.card, redesignStyles.detailsCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <LobbyInfoItem label="BATCH" value={lobbyData?.session?.batchNumber || '—'} theme={theme} />
        <LobbyInfoItem label="TIME" value={lobbyData?.session?.timeLabel || '—'} theme={theme} />
        <LobbyInfoItem label="ROOM" value={lobbyData?.session?.roomName || lobbyData?.session?.venue || 'TBD'} theme={theme} />
      </View>

      <View
        testID={practiceMode ? 'tutorial-lobby-card' : undefined}
        ref={practiceMode ? lobbyTutorial.ref : undefined}
        style={[
          redesignStyles.statusCard,
          {
            backgroundColor: isTerminal || isDeclined || packDownloadError ? theme.card : theme.warningBackground,
            borderColor: isTerminal || isDeclined || packDownloadError ? theme.cardBorder : theme.warningBorder,
          },
        ]}
      >
        <Text style={[redesignStyles.statusTitle, { color: theme.text }]}>{statusTitle}</Text>
        <Text style={[redesignStyles.statusBody, { color: theme.secondaryText }]}>{statusBody}</Text>

        {controller.state === 'FINISHING_DOWNLOAD' ? (
          <View style={redesignStyles.downloadBlock}>
            <View style={redesignStyles.downloadHeader}>
              <Text style={[redesignStyles.downloadLabel, { color: theme.text }]}>Examination pack</Text>
              <Text style={[redesignStyles.downloadPercent, { color: theme.primary }]}>{progressPercent}%</Text>
            </View>
            <View style={[redesignStyles.progressTrack, { backgroundColor: theme.cardBorder }]}>
              <View style={[redesignStyles.progressFill, { width: `${progressPercent}%`, backgroundColor: theme.primary }]} />
            </View>
            <Text style={[redesignStyles.downloadDetail, { color: theme.secondaryText }]}>
              {progress.questionsExpected > 0
                ? `${progress.questionsDownloaded} of ${progress.questionsExpected} questions downloaded`
                : progress.phaseLabel}
            </Text>
          </View>
        ) : null}

        {controller.state === 'STARTING' || (authority === 'ACTIVE' && examReady) ? (
          <View style={redesignStyles.inlineStatus}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[redesignStyles.inlineStatusText, { color: theme.primary }]}>Launching Exam Browser...</Text>
          </View>
        ) : null}

        {packDownloadError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry download"
            onPress={() => void controller.retryPackDownload()}
            style={[redesignStyles.smallAction, { backgroundColor: theme.primary }]}
          >
            <Text style={[redesignStyles.smallActionText, { color: theme.white }]}>Retry download</Text>
          </Pressable>
        ) : null}

        {isTerminal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return Home"
            onPress={onExit}
            style={[redesignStyles.smallAction, { backgroundColor: theme.primary }]}
          >
            <Text style={[redesignStyles.smallActionText, { color: theme.white }]}>Return Home</Text>
          </Pressable>
        ) : null}

        {isDeclined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to Join Screen"
            onPress={() => void onDeclinedAdmission()}
            style={[redesignStyles.smallAction, { backgroundColor: theme.primary }]}
          >
            <Text style={[redesignStyles.smallActionText, { color: theme.white }]}>Return to Join Screen</Text>
          </Pressable>
        ) : null}
      </View>

      {showWhileWaiting ? (
        <View style={[redesignStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[redesignStyles.cardTitle, { color: theme.text }]}>While you wait</Text>
          <LobbyWaitRow text="Keep this screen open" theme={theme} />
          <LobbyWaitRow text="Passing score is 75%" theme={theme} />
          <LobbyWaitRow text="Put away other devices" theme={theme} />
        </View>
      ) : null}

      <View style={[redesignStyles.networkRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={[redesignStyles.networkDot, { backgroundColor: proctorReconnecting ? theme.error : theme.successText }]} />
        <Text style={[redesignStyles.networkText, { color: theme.secondaryText }]}>
          {proctorReconnecting
            ? 'PROCTOR RECONNECTING · SAVED PROGRESS PRESERVED'
            : `LOCAL LINK ACTIVE · PULSE ${new Date(lastSeen).toLocaleTimeString()}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh lobby status"
          onPress={() => void controller.lobbyQuery.refetch()}
          style={redesignStyles.refreshButton}
        >
          <RefreshCw size={16} color={theme.primary} />
        </Pressable>
      </View>
    </ExamineeRedesignChrome>
  );
}

function createPracticeLobbyController(applicant?: PracticeApplicant): LobbyControllerSnapshot {
  const now = Date.now();
  const progress: ExamPackProgress = {
    ...INITIAL_PACK_PROGRESS,
    percent: 100,
    questionsDownloaded: 25,
    questionsExpected: 25,
    moduleReady: true,
    hashVerified: true,
    configurationComplete: true,
  };
  return {
    lobbyData: {
      session: {
        batchNumber: applicant?.batchNumber || 'Practice batch',
        timeLabel: applicant?.timeSlot || 'Practice session',
        roomName: applicant?.roomName || 'Practice room',
      },
    },
    currentStudent: applicant ? {
      fullName: applicant.fullName,
      programName: applicant.programName,
    } : null,
    isStale: false,
    progress,
    packDownloadError: null,
    authority: 'WAITING',
    pulseOk: true,
    approvalStatus: 'approved',
    lastSeen: now,
    networkBanner: null,
    state: 'DASHBOARD',
    error: null,
    lobbyQuery: { isError: false, refetch: async () => undefined },
    retryPackDownload: async () => undefined,
  } as unknown as LobbyControllerSnapshot;
}

export function PracticeWaitingRoom({ applicant }: { applicant: PracticeApplicant }) {
  const router = useRouter();
  const tutorialIndex = usePracticeStore((state) => state.tutorialIndex);
  const tutorialActive = usePracticeStore((state) => state.tutorialActive);
  useEffect(() => {
    if (tutorialActive && tutorialIndex === 3) return;
    const timer = setTimeout(() => router.replace('/practice/exam' as any), 1800);
    return () => clearTimeout(timer);
  }, [router, tutorialIndex, tutorialActive]);

  return (
    <LobbyRedesign
      practiceMode
      practiceApplicant={applicant}
      onExit={() => router.replace('/practice/confirmation' as any)}
      onDeclinedAdmission={async () => undefined}
    />
  );
}

function LobbyInfoItem({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useExamineeRedesignTheme>;
}) {
  return (
    <View style={redesignStyles.infoItem}>
      <Text style={[redesignStyles.infoLabel, { color: theme.secondaryText }]}>{label}</Text>
      <Text style={[redesignStyles.infoValue, { color: theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function LobbyWaitRow({
  text,
  theme,
}: {
  text: string;
  theme: ReturnType<typeof useExamineeRedesignTheme>;
}) {
  return (
    <View style={redesignStyles.waitRow}>
      <Text style={[redesignStyles.waitCheck, { color: theme.secondaryText }]}>✓</Text>
      <Text style={[redesignStyles.waitText, { color: theme.secondaryText }]}>{text}</Text>
    </View>
  );
}

const redesignStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 12,
  },
  connectionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectionText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  identityName: {
    fontSize: 21,
    lineHeight: 27,
    fontFamily: 'Poppins_700Bold',
  },
  identityProgram: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
  },
  detailsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoItem: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  infoLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  infoValue: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Poppins_700Bold',
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 10,
  },
  statusTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
  },
  statusBody: {
    fontSize: 16,
    lineHeight: 25,
    fontFamily: 'Poppins_400Regular',
  },
  downloadBlock: {
    gap: 7,
    marginTop: 4,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  downloadPercent: {
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  downloadDetail: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  inlineStatusText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  smallAction: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  smallActionText: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
  },
  cardTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  waitCheck: {
    fontSize: 22,
    lineHeight: 24,
    fontFamily: 'Poppins_400Regular',
  },
  waitText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
    fontFamily: 'Poppins_400Regular',
  },
  networkRow: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  networkBanner: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  networkBannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  networkText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  refreshButton: {
    padding: 5,
  },
  footer: {
    paddingTop: 14,
  },
  secondaryButton: {
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
});
