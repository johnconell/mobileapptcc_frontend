import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  List,
  ShieldAlert,
} from 'lucide-react-native';

import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { ThemeProvider, useThemeTokens } from '@/shared/contexts/ThemeContext';
import {
  BottomBar,
  ExamHeader,
  QuestionCard,
  QuestionNavigatorSheet,
  SubmitConfirmDialog,
  Row,
  type CategoryItem,
} from '@/shared/components/ui';
import { ExamWifiDisconnectOverlay } from '@/features/examinations/components/ExamWifiDisconnectOverlay';
import { buildCategoryProgress } from '@/features/examinations/components/ExamCategoryNav';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore, type ExamNavMode } from '@/features/examinations/stores/examStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import type { QuestionNavigatorFilter } from '@/shared/components/ui/QuestionNavigatorSheet';
import { useExamTimer } from '@/features/examinations/hooks/useExamTimer';
import { useExamSecurity } from '@/features/examinations/hooks/useExamSecurity';
import { useExamLock } from '@/features/examinations/hooks/useExamLock';
import { useGuidedAccessStatus } from '@/features/examinations/hooks/useGuidedAccessStatus';
import { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';
import { useWifiExamGate } from '@/features/monitoring/hooks/useWifiExamGate';
import { resolveDisconnectGraceSeconds } from '@/shared/utils/gracePeriod';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QuestionRepository } from '@/features/examinations/repositories/QuestionRepository';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import {
  ExamSubmissionStore,
  type FinalizedSubmission,
} from '@/features/examinations/services/examSubmissionStore';
import { SUBMISSION_RETRY_CONFIG } from '@/features/examinations/services/examSubmissionCoordinator';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { parseStartPulse } from '@/features/examinations/services/examStartCoordinator';
import { playExamTimeWarning } from '@/features/examinations/services/examTimeWarning';
import { releaseExamSessionRestrictions } from '@/features/examinations/services/examSessionRestrictions';
import { recordStudentDisconnect } from '@/features/monitoring/services/studentDisconnectAudit';
import type { StudentDisconnectReason } from '@/features/monitoring/services/studentDisconnectAudit';
import { classifyPeerReconnectError } from '@/features/examinations/services/peerReconnectErrors';
import { userFacingError } from '@/shared/utils/userFacingError';
import {
  createSubmitController,
  type SubmitReason,
} from '@/features/examinations/services/submitGate';
import type { ChoiceKey, Question } from '@/shared/types';

function categoryKeyOf(question: Question): string {
  return (question.category || question.subjectId || 'General').trim() || 'General';
}

const SHOW_BUILD_STAMP = __DEV__ || process.env.EXPO_PUBLIC_DEBUG_BUILD_STAMP === '1';

interface ExamQuestionItemProps {
  question: Question;
  index: number;
  totalQuestions: number;
  disabled: boolean;
  onSelectChoice: (questionId: string, choice: ChoiceKey, index: number) => void;
  onToggleFlag: (questionId: string) => void;
}

const ExamQuestionItem = React.memo(function ExamQuestionItem({
  question,
  index,
  totalQuestions,
  disabled,
  onSelectChoice,
  onToggleFlag,
}: ExamQuestionItemProps) {
  const selectAnswer = useExamStore(
    useCallback((state) => state.answers[question.id]?.selectedAnswer ?? null, [question.id]),
  );
  const isFlagged = useExamStore(
    useCallback((state) => Boolean(state.flags[question.id]), [question.id]),
  );
  const handleSelect = useCallback(
    (choice: ChoiceKey) => onSelectChoice(question.id, choice, index),
    [question.id, index, onSelectChoice],
  );
  const handleFlag = useCallback(
    () => onToggleFlag(question.id),
    [question.id, onToggleFlag],
  );

  return (
    <QuestionCard
      question={question}
      questionNumber={question.number ?? index + 1}
      totalQuestions={totalQuestions}
      selectedAnswer={selectAnswer}
      isFlagged={isFlagged}
      onSelect={handleSelect}
      onToggleFlag={handleFlag}
      disabled={disabled}
    />
  );
});

function ExamScreenInner() {
  useKeepAwake();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useThemeTokens();

  const flatListRef = useRef<FlatList<Question>>(null);

  // Modals & Navigation state
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null | undefined>(undefined);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>('all');
  const openSubmitConfirmation = useCallback(() => {
    setSubmitConfirmOpen(true);
  }, []);
  const closeSubmitConfirmation = useCallback(() => {
    setSubmitConfirmOpen(false);
  }, []);
  const closeNavigator = useCallback(() => {
    setNavigatorOpen(false);
  }, []);

  // Network & Lifecycle state
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [roomEnded, setRoomEnded] = useState(false);
  const [emergencySuspended, setEmergencySuspended] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState<string | null>(null);
  const [manualReconnectFailed, setManualReconnectFailed] = useState(false);
  const [isLeavingExam, setIsLeavingExam] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [checkpointSaved, setCheckpointSaved] = useState(false);
  const [checkpointLoadRetry, setCheckpointLoadRetry] = useState(0);

  // Store state & selectors
  const questions = useExamStore((s) => s.questions);
  const answers = useExamStore((s) => s.answers);
  const flags = useExamStore((s) => s.flags);
  const currentIndex = useExamStore((s) => s.currentIndex);
  const setCurrentIndex = useExamStore((s) => s.setCurrentIndex);
  const remainingSeconds = useExamTimer(questions.length > 0);
  const totalDurationSeconds = useExamStore((s) => s.totalDurationSeconds);
  const toggleFlag = useExamStore((s) => s.toggleFlag);
  const navMode = useExamStore((s) => s.navMode);
  const setNavMode = useExamStore((s) => s.setNavMode);
  const sessionId = useExamStore((s) => s.sessionId);
  const startedAt = useExamStore((s) => s.startedAt);
  const selectAnswer = useExamStore((s) => s.selectAnswer);
  const markAutoSaved = useExamStore((s) => s.markAutoSaved);
  const unansweredCount = useExamStore((s) => s.unansweredCount);
  const answeredCount = useExamStore((s) => s.answeredCount);
  const setPaused = useExamStore((s) => s.setPaused);
  const markSubmitting = useExamStore((s) => s.markSubmitting);
  const markSubmitted = useExamStore((s) => s.markSubmitted);
  const restoreProgress = useExamStore((s) => s.restoreProgress);
  const timerStatus = useExamStore((s) => s.timerStatus);
  const isReconciling = timerStatus === 'reconciliation_required';

  const restoredRef = useRef(false);
  const checkpointRecoveryBlocked = useRef(false);
  const lowTimeWarnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const forceEndSubmissionStarted = useRef(false);
  const exitStartedRef = useRef(false);

  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const securityEnabled = questions.length > 0;
  const [guidedAccess] = useGuidedAccessStatus();
  const guidedAccessIncidentOpen = useRef(false);

  const persistLocalCheckpoint = useCallback(async () => {
    if (checkpointRecoveryBlocked.current) return false;
    const state = useExamStore.getState();
    const student = useStudentStore.getState().verifiedStudent;
    if (!state.sessionId || !student?.id || !state.questions.length) return false;

    setCheckpointSaving(true);
    setCheckpointSaved(false);
    try {
      await ExamProgressStore.save({
        sessionId: state.sessionId,
        studentId: student.id,
        attemptId: state.attemptId ?? undefined,
        answers: state.answers,
        flags: state.flags,
        navMode: state.navMode,
        currentIndex: state.currentIndex,
        remainingSeconds: state.remainingSeconds,
        totalDurationSeconds: state.totalDurationSeconds,
        startedAt: state.startedAt,
        deadline: state.deadline,
        scheduleClosingTime: state.scheduleClosingTime,
        timeSync: state.timeSync ?? undefined,
      });
      markAutoSaved();
      setCheckpointSaved(true);
      setCheckpointError(null);
      return true;
    } catch (error) {
      console.warn('[EXAM CHECKPOINT] Local save failed:', {
        errorName: error instanceof Error ? error.name : 'StorageError',
      });
      setCheckpointError(
        'Unable to save your answers on this device. Your answers remain on this screen; keep the exam open and retry.',
      );
      return false;
    } finally {
      setCheckpointSaving(false);
    }
  }, [markAutoSaved]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !securityEnabled || roomEnded || isLeavingExam) return;
    if (guidedAccess === 'enabled') {
      guidedAccessIncidentOpen.current = false;
      return;
    }
    if (guidedAccessIncidentOpen.current) return;
    guidedAccessIncidentOpen.current = true;
    const state = useExamStore.getState();
    const student = useStudentStore.getState().verifiedStudent;
    if (state.sessionId && student?.id) {
      void persistLocalCheckpoint();
      void SecurityRepository.recordViolation({
        sessionId: state.sessionId,
        studentId: student.id,
        studentName: student.fullName,
        type: 'guided_access_lost',
        message: guidedAccess === 'unavailable'
          ? 'Guided Access verification became unavailable during examination.'
          : 'Guided Access became inactive during examination.',
      }).catch((error) => console.warn('[GUIDED ACCESS] Incident log failed:', error));
    }
  }, [guidedAccess, securityEnabled, roomEnded, isLeavingExam, persistLocalCheckpoint]);

  // Sync mode with local storage
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedNavMode = await appStorage.getItem('tcc.settings.exam.nav_mode');
        if (active && (storedNavMode === 'one_at_a_time' || storedNavMode === 'scroll')) {
          setNavMode(storedNavMode as ExamNavMode);
        }
      } catch {
        /* fallback */
      }
    })();
    return () => {
      active = false;
    };
  }, [setNavMode]);

  const handleSetNavMode = useCallback(
    (mode: ExamNavMode) => {
      setNavMode(mode);
      void appStorage.setItem('tcc.settings.exam.nav_mode', mode);
    },
    [setNavMode],
  );

  // Compute categories
  const categories = useMemo(() => buildCategoryProgress(questions, answers), [questions, answers]);

  const categoriesList: CategoryItem[] = useMemo(() => {
    return categories.map((c) => ({
      key: c.key,
      name: c.label || c.key,
      answered: c.answered,
      total: c.total,
    }));
  }, [categories]);

  const answered = answeredCount();
  const total = questions.length;
  const unanswered = unansweredCount();
  const flaggedCount = useMemo(() => Object.values(flags).filter(Boolean).length, [flags]);

  const safeIndex = Math.min(Math.max(0, currentIndex), Math.max(0, questions.length - 1));
  const activeQuestion = questions[safeIndex] ?? null;

  useEffect(() => {
    console.log('[STUDENT] Exam Screen Opened');
    void ExamLifecycle.apply('ACTIVE');
    void LobbyRepository.acknowledgeStart('entered');
  }, []);

  // Flush encrypted exam progress before the OS backgrounds or closes the app.
  useEffect(() => {
    const flush = () => {
      const state = useExamStore.getState();
      const student = useStudentStore.getState().verifiedStudent;
      if (!state.sessionId || !student?.id || !state.questions.length) return;
      void persistLocalCheckpoint();
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') flush();
    });
    if (typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') flush();
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', flush);
      return () => {
        appStateSubscription.remove();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', flush);
      };
    }
    return () => {
      appStateSubscription.remove();
    };
  }, [persistLocalCheckpoint]);

  const onWifiDisconnect = useCallback(
    (reason: 'wifi_lost' | 'wrong_network' | 'proctor_network_change') => {
      if (reason === 'proctor_network_change') return;
      void LobbyRepository.reportWifiDisconnect(reason, sessionId).catch(() => undefined);
    },
    [sessionId],
  );

  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(120);

  useEffect(() => {
    void resolveDisconnectGraceSeconds().then((val) => {
      if (typeof val === 'number' && val > 0) {
        setGracePeriodSeconds(val);
      }
    });
  }, []);

  const graceExpiredCallbackRef = useRef<() => void>(() => {});

  const {
    wifiLocked,
    requiresPin,
    unlockAfterReconnect,
    disconnectReason,
    graceSecondsRemaining,
    reconnectFailed,
  } = useWifiExamGate({
    enabled: securityEnabled,
    onDisconnect: onWifiDisconnect,
    onGraceExpired: () => graceExpiredCallbackRef.current(),
    gracePeriodSeconds,
  });

  const exitToLanding = useCallback(
    async (reason: StudentDisconnectReason, message: string) => {
      if (exitStartedRef.current) return;
      exitStartedRef.current = true;
      setIsLeavingExam(true);

      // Release Android Lock Task before any storage cleanup so a failed local
      // write can never keep the student inside kiosk mode.
      await releaseExamSessionRestrictions('exam_exit').catch(() => undefined);

      const token = await appStorage.getItem(STORAGE_KEYS.participationToken).catch(() => null);
      if (token) {
        // This is local-only. Bound the wait so a storage failure cannot block
        // the offline Exit exam action or the landing-page navigation.
        await Promise.race([
          recordStudentDisconnect(reason, token, sessionId).catch(() => undefined),
          new Promise<void>((resolve) => setTimeout(resolve, 1500)),
        ]);
      }

      useExamStore.getState().reset();
      useStudentStore.getState().reset();
      useLobbyStore.getState().reset();
      router.replace({ pathname: '/', params: { examExitNotice: message } } as any);

      // Cleanup continues after navigation; the native kiosk has already been
      // stopped and the in-memory exam state is cleared synchronously above.
      void ExamLifecycle.clear().catch(() => undefined);
      void clearApplicantExamMaterial().catch(() => undefined);
    },
    [router, sessionId],
  );

  const [isInactiveOrBackground, setIsInactiveOrBackground] = useState(
    Platform.OS === 'ios' && AppState.currentState !== 'active',
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (state) => {
      setIsInactiveOrBackground(state !== 'active');
    });
    return () => sub.remove();
  }, []);

  // Periodic autosave to backend API
  useEffect(() => {
    if (questions.length === 0 || wifiLocked) return;
    const timer = setTimeout(() => {
      const payload = Object.fromEntries(
        Object.values(answers).map((a) => [a.questionId, a.selectedAnswer]),
      );
      void QuestionRepository.saveProgress(payload).catch((error) => {
        console.warn('[EXAM CHECKPOINT] Server autosave unavailable:', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, questions.length, wifiLocked]);

  // Periodic autosave to local offline store
  useEffect(() => {
    if (!questions.length || !sessionId || !verifiedStudent?.id) return;
    const timer = setTimeout(() => {
      void persistLocalCheckpoint();
    }, 2000);
    return () => clearTimeout(timer);
  }, [answers, flags, navMode, currentIndex, sessionId, verifiedStudent?.id, startedAt, questions.length, persistLocalCheckpoint]);

  // Restore progress on mount
  useEffect(() => {
    if (restoredRef.current || !questions.length || !sessionId || !verifiedStudent?.id) return;
    restoredRef.current = true;
    void ExamProgressStore.load().then((checkpoint) => {
      if (checkpoint && checkpoint.sessionId === sessionId && checkpoint.studentId === verifiedStudent.id) {
        restoreProgress({
          answers: checkpoint.answers,
          flags: checkpoint.flags,
          navMode: checkpoint.navMode,
          currentIndex: checkpoint.currentIndex,
          remainingSeconds: checkpoint.remainingSeconds,
          totalDurationSeconds: checkpoint.totalDurationSeconds,
          startedAt: checkpoint.startedAt,
          deadline: checkpoint.deadline,
          scheduleClosingTime: checkpoint.scheduleClosingTime,
          attemptId: checkpoint.attemptId,
          timeSync: checkpoint.timeSync,
        });
        markAutoSaved(checkpoint.savedAt);
        setCheckpointSaved(true);
      }
      checkpointRecoveryBlocked.current = false;
      setCheckpointError(null);
      setPaused(false);
    }).catch((error) => {
      console.warn('[EXAM CHECKPOINT] Could not restore local answers:', {
        errorName: error instanceof Error ? error.name : 'StorageError',
      });
      checkpointRecoveryBlocked.current = true;
      setCheckpointSaved(false);
      setPaused(true);
      setCheckpointError(
        'Saved exam progress could not be read. Answering is paused to protect your existing data. Retry loading the saved progress.',
      );
    });
  }, [questions.length, sessionId, verifiedStudent?.id, restoreProgress, markAutoSaved, setPaused, checkpointLoadRetry]);

  // Heartbeat & Timer Sync with proctor
  useEffect(() => {
    if (!securityEnabled) return;
    let cancelled = false;
    const beat = async () => {
      const pulse = await LobbyRepository.sendHeartbeat();
      if (typeof pulse.emergencySuspended === 'boolean') {
        setEmergencySuspended(pulse.emergencySuspended);
        setEmergencyReason(pulse.emergencySuspended ? pulse.emergencyReason ?? null : null);
      }
      if (pulse.removed || pulse.myStatus === 'terminated') {
        cancelled = true;
        await exitToLanding('proctor_removed', 'The proctor removed you from this examination.');
        return;
      }
      if (pulse.sessionNotFound) {
        cancelled = true;
        await exitToLanding(
          'session_ended',
          'This examination session has ended or is no longer available. The app has been unlocked.',
        );
        return;
      }
      const parsed = parseStartPulse(pulse);
      if (cancelled) return;
      if (parsed?.roomStatus === 'terminated') {
        cancelled = true;
        await exitToLanding('proctor_removed', 'The proctor removed you from this examination.');
        return;
      }
      if (parsed?.roomStatus === 'ended') {
        await ExamLifecycle.applyFromServer('ended');
        setRoomEnded(true);
        return;
      }
      if (pulse.serverTime || typeof pulse.remainingSeconds === 'number') {
        useExamStore.getState().reconcileWithServerTime({
          serverTime: pulse.serverTime,
          startedAt: pulse.startedAt,
          endsAt: pulse.endsAt,
          remainingSeconds: pulse.remainingSeconds,
          durationMinutes: pulse.durationMinutes,
        });
      }
      if (!pulse.ok) {
        const global = await PeerExamClient.getGlobalStatus();
        if (!cancelled && global?.roomStatus === 'ended') {
          await ExamLifecycle.applyFromServer('ended');
          setRoomEnded(true);
          return;
        }
        const health = await PeerExamClient.probeHealth();
        if (!cancelled && health === 'ended') {
          await ExamLifecycle.applyFromServer('ended');
          setRoomEnded(true);
          return;
        }
        if (!cancelled && health === 'idle') {
          await exitToLanding(
            'session_ended',
            'This examination session is closed or no longer available. The app has been unlocked.',
          );
        }
      }
    };

    const interval = setInterval(() => {
      void beat();
    }, 10000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void beat();
    });
    void beat();
    return () => {
      cancelled = true;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [securityEnabled, exitToLanding]);

  const finalizeSubmission = useCallback(
    async (reason: SubmitReason) => {
      const finalReason =
        reason === 'manual'
          ? 'submitted'
          : reason === 'timeout'
            ? 'time_expired'
            : 'proctor_terminated';
      const payload = Object.fromEntries(
        Object.values(answers).map((answer) => [answer.questionId, answer.selectedAnswer]),
      );

      // 1. Freeze answering and mark submitting
      markSubmitting(true);

      // Persist the finalized record before releasing the exam lock or leaving this screen.
      try {
        const state = useExamStore.getState();
        const sid = sessionId ?? 'unknown';
        const stid = verifiedStudent?.id ?? 'unknown';
        const appCode = verifiedStudent?.studentId || verifiedStudent?.id || 'unknown';
        const currentAttemptId =
          state.attemptId || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const idempotencyKey = `sub_${sid}_${appCode}_${currentAttemptId}`;

        const destination = (await PeerExamClient.isActive())
          ? 'proctor_peer'
          : (await OfflineStore.isOfflineMode())
            ? 'local_offline'
            : 'cloud';

        const finalizedRecord: FinalizedSubmission = {
          submissionId: `sub_${Date.now()}`,
          attemptId: currentAttemptId,
          idempotencyKey,
          sessionId: sid,
          studentId: stid,
          applicantCode: appCode,
          studentName: verifiedStudent?.fullName,
          answers: payload,
          finalReason,
          status: 'pending',
          destination,
          attemptCount: 0,
          maxAttempts: SUBMISSION_RETRY_CONFIG.maxAttempts,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await ExamSubmissionStore.save(finalizedRecord);
      } catch (error) {
        console.warn('[SUBMIT] Finalized submission could not be saved:', {
          errorName: error instanceof Error ? error.name : 'StorageError',
        });
        markSubmitting(false);
        if (reason === 'proctor_ended') {
          await releaseExamSessionRestrictions('session_ended').catch((releaseError) => {
            console.error('[EXAM SECURITY] Could not release restrictions after proctor force-end:', {
              errorName: releaseError instanceof Error ? releaseError.name : 'SecurityError',
            });
          });
        }
        await persistLocalCheckpoint();
        throw new Error(
          'Unable to safely save your submission on this device. Your answers remain on this screen; retry before leaving.',
        );
      }

      try {
        await releaseExamSessionRestrictions('submission_confirmed');
      } catch (error) {
        console.error('[EXAM SECURITY] Could not release restrictions after saving submission:', {
          errorName: error instanceof Error ? error.name : 'SecurityError',
        });
      }

      router.replace('/(student)/submitting');
    },
    [answers, sessionId, verifiedStudent, markSubmitting, router, persistLocalCheckpoint],
  );
  const finalizeSubmissionRef = useRef(finalizeSubmission);
  finalizeSubmissionRef.current = finalizeSubmission;

  const submitController = useMemo(
    () =>
      createSubmitController({
        finalizeSubmission: (reason) => finalizeSubmissionRef.current(reason),
        onFailure: (error) => {
          Alert.alert(
            'Submission failed',
            userFacingError(
              error,
              'Unable to safely save your submission on this device. Your answers remain on this screen; retry before leaving.',
            ),
          );
        },
      }),
    [],
  );
  const requestSubmit = useCallback(
    (reason: SubmitReason, typedPhrase?: string) => {
      const result = submitController.requestSubmit(reason, typedPhrase);
      if (result.ok) {
        setSubmitConfirmOpen(false);
        setNavigatorOpen(false);
        Keyboard.dismiss();
      }
      return result;
    },
    [submitController],
  );

  const leaveEndedExam = useCallback(() => {
    requestSubmit('proctor_ended');
  }, [requestSubmit]);

  useEffect(() => {
    if (!roomEnded || forceEndSubmissionStarted.current) return;
    forceEndSubmissionStarted.current = true;
    requestSubmit('proctor_ended');
  }, [roomEnded, requestSubmit]);

  const confirmSubmit = useCallback(
    (typedPhrase: string) => {
      requestSubmit('manual', typedPhrase);
    },
    [requestSubmit],
  );
  const reviewUnansweredAndFlagged = useCallback(() => {
    setSubmitConfirmOpen(false);
    setNavigatorFilter('review');
    setNavigatorOpen(true);
  }, []);

  graceExpiredCallbackRef.current = () => {
    if (!autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      requestSubmit('timeout');
    }
  };

  // Android Kiosk Pinning
  const { isKioskActive, requestLock } = useExamLock({
    enabled: securityEnabled && !wifiLocked && !roomEnded && !isLeavingExam && remainingSeconds > 0,
  });

  const isAndroidUnpinned = Platform.OS === 'android' && !isKioskActive;
  const isIosUnguided = Platform.OS === 'ios' && guidedAccess !== 'enabled';
  const paused =
    wifiLocked ||
    emergencySuspended ||
    isAndroidUnpinned ||
    isIosUnguided ||
    roomEnded ||
    isLeavingExam ||
    remainingSeconds <= 0 ||
    isReconciling;

  useEffect(() => {
    setPaused(paused);
  }, [paused, setPaused]);

  useExamSecurity({
    enabled: securityEnabled && !wifiLocked && !roomEnded && !isLeavingExam && remainingSeconds > 0,
    sessionId,
    studentId: verifiedStudent?.id ?? null,
    studentName: verifiedStudent?.fullName ?? null,
    onRequestSubmit: openSubmitConfirmation,
  });

  const handleReconnect = useCallback(
    async (code: string) => {
      setReconnectLoading(true);
      setReconnectError(null);
      setManualReconnectFailed(false);
      try {
        const result = await LobbyRepository.reconnectWithCode(code);
        if (!result.ok) {
          const message = result.message || 'Cannot reach the proctor';
          if (message === 'Removed by proctor') {
            await exitToLanding('proctor_removed', 'The proctor removed you from this examination.');
            return;
          }
          if (message === 'Session ended') {
            await exitToLanding(
              'session_ended',
              'This examination session has ended or is no longer available. The app has been unlocked.',
            );
            return;
          }
          setReconnectError(message);
          setManualReconnectFailed(true);
          return;
        }

        const pulse = await LobbyRepository.sendHeartbeat();
        if (pulse.removed || pulse.myStatus === 'terminated') {
          await exitToLanding('proctor_removed', 'The proctor removed you from this examination.');
          return;
        }
        if (pulse.sessionNotFound) {
          await exitToLanding(
            'session_ended',
            'This examination session has ended or is no longer available. The app has been unlocked.',
          );
          return;
        }
        if (!pulse.ok) {
          const message = classifyPeerReconnectError(pulse.message || 'Cannot reach the proctor');
          setReconnectError(
            message === 'Cannot reach the proctor'
              ? "Cannot connect to the proctor's device. Check your local Wi-Fi connection and retry."
              : message,
          );
          setManualReconnectFailed(true);
          return;
        }

        const unlocked = await unlockAfterReconnect(true);
        if (!unlocked) {
          setReconnectError('Cannot reach the proctor. Check the exam Wi-Fi and try again.');
          setManualReconnectFailed(true);
          return;
        }
        setReconnectError(null);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '';
        const peerMessage = classifyPeerReconnectError(rawMessage);
        setReconnectError(
          peerMessage === 'Cannot reach the proctor'
            ? "Cannot connect to the proctor's device. Check your local Wi-Fi connection and retry."
            : userFacingError(error, 'Unable to reconnect to the proctor. Check your local Wi-Fi and retry.'),
        );
        setManualReconnectFailed(true);
      } finally {
        if (!exitStartedRef.current) setReconnectLoading(false);
      }
    },
    [exitToLanding, unlockAfterReconnect],
  );

  const handleProctorNetworkRetry = useCallback(async () => {
    setReconnectLoading(true);
    setReconnectError(null);
    setManualReconnectFailed(false);
    try {
      await PeerExamClient.refreshHostFromCloud();
      if (exitStartedRef.current) return;

      const pulse = await LobbyRepository.sendHeartbeat();
      if (pulse.removed || pulse.myStatus === 'terminated') {
        await exitToLanding('proctor_removed', 'The proctor removed you from this examination.');
        return;
      }
      if (pulse.sessionNotFound) {
        await exitToLanding(
          'session_ended',
          'This examination session has ended or is no longer available. The app has been unlocked.',
        );
        return;
      }
      if (!pulse.ok) {
        const message = classifyPeerReconnectError(pulse.message || 'Cannot reach the proctor');
        throw new Error(
          message === 'Cannot reach the proctor'
            ? "Cannot connect to the proctor's device. Check your local Wi-Fi connection."
            : message,
        );
      }

      const unlocked = await unlockAfterReconnect();
      if (exitStartedRef.current) return;
      if (!unlocked) {
        throw new Error('Cannot reach the proctor. Scan the room QR code to try another host address.');
      }

      setReconnectError(null);
      setManualReconnectFailed(false);
    } catch (error) {
      if (exitStartedRef.current) return;
      const rawMessage = error instanceof Error ? error.message : '';
      const peerMessage = classifyPeerReconnectError(rawMessage);
      setReconnectError(
        peerMessage === 'Cannot reach the proctor'
          ? "Cannot connect to the proctor's device. Check your local Wi-Fi connection and retry."
          : userFacingError(error, 'Unable to reconnect to the proctor. Check your local Wi-Fi and retry.'),
      );
      setManualReconnectFailed(true);
      router.push({ pathname: '/(student)/scan', params: { mode: 'reconnect' } } as any);
    } finally {
      if (!exitStartedRef.current) setReconnectLoading(false);
    }
  }, [exitToLanding, router, unlockAfterReconnect]);
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
      headerShown: false,
    });

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const actionType = event.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') return;
      event.preventDefault();
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (remainingSeconds > 10) {
      lowTimeWarnedRef.current = false;
      return;
    }
    if (remainingSeconds <= 10 && remainingSeconds > 0 && !lowTimeWarnedRef.current) {
      lowTimeWarnedRef.current = true;
      playExamTimeWarning();
    }
  }, [remainingSeconds]);

  useEffect(() => {
    if (!questions.length) router.replace('/');
  }, [questions.length, router]);

  useEffect(() => {
    if (autoSubmittedRef.current) return;
    if (roomEnded) {
      autoSubmittedRef.current = true;
      requestSubmit('proctor_ended');
      return;
    }
    // If the proctor is unreachable when time expires, keep the reconnect
    // screen available (including its offline Exit exam action). Once the
    // connection returns this effect submits the saved answers as usual.
    if (questions.length > 0 && remainingSeconds <= 0 && !wifiLocked) {
      autoSubmittedRef.current = true;
      requestSubmit('timeout');
    }
  }, [remainingSeconds, questions.length, roomEnded, wifiLocked, requestSubmit]);

  // Answer selection & instant local persistence
  const handleSelectChoice = useCallback(
    (questionId: string, choice: ChoiceKey, index: number) => {
      if (paused) return;
      selectAnswer(questionId, choice);
      setCurrentIndex(index);
      if (verifiedStudent?.id) {
        void LobbyRepository.touchActivity(verifiedStudent.id);
        void persistLocalCheckpoint();
      }
    },
    [paused, selectAnswer, setCurrentIndex, verifiedStudent?.id, persistLocalCheckpoint],
  );

  const handleToggleFlag = useCallback(
    (questionId: string) => {
      toggleFlag(questionId);
      if (verifiedStudent?.id) {
        void persistLocalCheckpoint();
      }
    },
    [toggleFlag, verifiedStudent?.id, persistLocalCheckpoint],
  );

  const handleJumpToQuestion = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      if (navMode === 'scroll') {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }, 50);
      }
    },
    [navMode, setCurrentIndex],
  );

  const handleSelectCategory = useCallback(
    (catKey: string | null) => {
      setSelectedCategoryFilter(catKey);
      if (catKey) {
        const targetIdx = questions.findIndex((q) => categoryKeyOf(q) === catKey);
        if (targetIdx >= 0) {
          handleJumpToQuestion(targetIdx);
        }
      }
    },
    [questions, handleJumpToQuestion],
  );

  const keyExtractor = useCallback((item: Question) => item.id, []);
  const handleScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    flatListRef.current?.scrollToOffset({
      offset: info.averageItemLength * info.index,
      animated: true,
    });
  }, []);

  useEffect(() => {
    if (navMode !== 'scroll') return;
    const timer = setTimeout(() => {
      const index = useExamStore.getState().currentIndex;
      if (index > 0) {
        flatListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [navMode]);

  const renderQuestionItem = useCallback(
    ({ item, index }: { item: Question; index: number }) => {
      return (
        <ExamQuestionItem
          question={item}
          index={index}
          totalQuestions={total}
          disabled={paused}
          onSelectChoice={handleSelectChoice}
          onToggleFlag={handleToggleFlag}
        />
      );
    },
    [total, handleSelectChoice, handleToggleFlag, paused],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const firstVisible = viewableItems.find((item) => item.isViewable && item.index !== null);
      if (typeof firstVisible?.index === 'number') {
        useExamStore.getState().setCurrentIndex(firstVisible.index);
      }
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  const openNavigator = useCallback(() => {
    setNavigatorFilter('all');
    setNavigatorOpen(true);
  }, []);

  if (!questions.length) return null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar hidden={true} />

      {SHOW_BUILD_STAMP ? (
        <Text style={[styles.buildStamp, { color: theme.textMuted }]}>build 2026-09-28-A</Text>
      ) : null}

      {/* iOS Privacy Blackout Shield */}
      {Platform.OS === 'ios' && isInactiveOrBackground ? (
        <View
          style={[
            styles.iosPrivacyBlackoutShield,
            { backgroundColor: `${isDark ? theme.bg : theme.text}F2` },
          ]}
          pointerEvents="auto"
        >
          <ShieldAlert size={64} color={theme.timer.red.text} strokeWidth={2.2} />
          <Text style={[styles.iosPrivacyShieldTitle, { color: theme.timer.red.text }]}>EXAMINATION PRIVACY SHIELD</Text>
          <Text style={[styles.iosPrivacyShieldSubtitle, { color: theme.onAccent }]}>
            Leaving the examination screen or accessing system drawers is strictly prohibited.
          </Text>
          <Text style={[styles.iosPrivacyShieldInstruction, { color: theme.onAccent }]}>
            Return to the app immediately and maintain Guided Access.
          </Text>
        </View>
      ) : null}

      {/* Android Mandatory App Pinning Shield */}
      {Platform.OS === 'android' && !isKioskActive && !wifiLocked && !roomEnded && !isLeavingExam && remainingSeconds > 0 ? (
        <View
          style={[
            styles.pinRequiredBlockingShield,
            { backgroundColor: `${isDark ? theme.bg : theme.text}F2` },
          ]}
          pointerEvents="auto"
        >
          <View style={[styles.pinRequiredCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.pinRequiredIconWrap, { backgroundColor: theme.accentSoft }]}>
              <ShieldAlert size={48} color={theme.accent} strokeWidth={2.2} />
            </View>
            <Text style={[styles.pinRequiredTitle, { color: theme.text }]}>App Pinning Required</Text>
            <Text style={[styles.pinRequiredSubtitle, { color: theme.textSecondary }]}>
              You must approve App Pinning to continue answering the examination.
            </Text>
            <Text style={[styles.pinRequiredInstruction, { color: theme.textMuted }]}>
              If you tap &quot;No thanks&quot;, you cannot continue the examination. Please tap &quot;Got it&quot; on the system prompt to proceed.
            </Text>
            <Pressable
              style={[styles.pinRequiredBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}
              onPress={() => void requestLock()}
              accessibilityRole="button"
              accessibilityLabel="Pin Screen & Continue"
            >
              <Text style={[styles.pinRequiredBtnText, { color: theme.onAccent }]}>Pin Screen &amp; Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 1. Exam Header (Title, Light/Dark Switch, TimerCard, CategoryDropdown, A-/A+) */}
      <View style={{ paddingTop: Math.max(insets.top, 8) }}>
        <ExamHeader
          remainingSeconds={remainingSeconds}
          totalDurationSeconds={totalDurationSeconds}
          categories={categoriesList}
          selectedCategory={
            selectedCategoryFilter === undefined
              ? activeQuestion
                ? categoryKeyOf(activeQuestion)
                : null
              : selectedCategoryFilter
          }
          onSelectCategory={handleSelectCategory}
          disabled={paused}
        />
      </View>

      {/* Time Verification Alert Banner */}
      {isReconciling ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.accent,
            backgroundColor: theme.accentSoft,
          }}
        >
          <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13, marginBottom: 2 }}>
            Time Verification Required
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 16 }}>
            A system clock change was detected. Your examination answers are safely preserved. Please stay connected to the exam Wi‑Fi to synchronize time with the proctor.
          </Text>
        </View>
      ) : null}

      {emergencySuspended ? (
        <View
          accessibilityRole="alert"
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.accent,
            backgroundColor: theme.accentSoft,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, marginBottom: 3 }}>
            Emergency suspension
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {emergencyReason || 'The proctor has temporarily paused this examination. Your saved answers are preserved.'}
          </Text>
        </View>
      ) : null}

      {checkpointError || checkpointSaving || checkpointSaved ? (
        <View
          accessibilityRole={checkpointError ? 'alert' : undefined}
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: checkpointError ? theme.accent : theme.border,
            backgroundColor: checkpointError ? theme.accentSoft : theme.surface,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <Text style={{ flex: 1, color: checkpointError ? theme.text : theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {checkpointError || (checkpointSaving ? 'Saving answers on this device…' : 'Answers saved on this device.')}
          </Text>
          {checkpointError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (checkpointRecoveryBlocked.current) {
                  restoredRef.current = false;
                  setCheckpointLoadRetry((attempt) => attempt + 1);
                } else {
                  void persistLocalCheckpoint();
                }
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700' }}>
                {checkpointRecoveryBlocked.current ? 'Retry load' : 'Retry save'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* 2. Info Row: "X of 100 answered" on left, "Scroll | One by one" on right */}
      <Row style={styles.infoRow}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.infoAnsweredText, { color: theme.textSecondary }]}
        >
          <Text style={[styles.infoAnsweredBold, { color: theme.text }]}>{answered}</Text>
          {` of ${total} answered`}
        </Text>

        {/* Labeled Mode Switch: 32px tall */}
        <View
          style={[
            styles.modeSwitch,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Scroll Mode */}
          <Pressable
            onPress={() => handleSetNavMode('scroll')}
            disabled={paused}
            accessibilityRole="button"
            accessibilityLabel="Scroll mode"
            style={[
              styles.modeSegment,
              navMode === 'scroll' && {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <List
              size={14}
              color={navMode === 'scroll' ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.modeSegmentText,
                {
                  color: navMode === 'scroll' ? theme.onAccent : theme.textSecondary,
                  fontWeight: navMode === 'scroll' ? '600' : '400',
                },
              ]}
            >
              Scroll
            </Text>
          </Pressable>

          {/* One by one Mode */}
          <Pressable
            onPress={() => handleSetNavMode('one_at_a_time')}
            disabled={paused}
            accessibilityRole="button"
            accessibilityLabel="One by one mode"
            style={[
              styles.modeSegment,
              navMode === 'one_at_a_time' && {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <Layers
              size={14}
              color={navMode === 'one_at_a_time' ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.modeSegmentText,
                {
                  color: navMode === 'one_at_a_time' ? theme.onAccent : theme.textSecondary,
                  fontWeight: navMode === 'one_at_a_time' ? '600' : '400',
                },
              ]}
            >
              One by one
            </Text>
          </Pressable>
        </View>
      </Row>

      {/* 3. Question Area */}
      <View style={styles.questionArea}>
        {navMode === 'scroll' ? (
          <FlatList
            ref={flatListRef}
            data={questions}
            keyExtractor={keyExtractor}
            renderItem={renderQuestionItem}
            contentContainerStyle={styles.scrollListContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={7}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScrollToIndexFailed={handleScrollToIndexFailed}
          />
        ) : (
          <ScrollView
            style={styles.oneByOneScroll}
            contentContainerStyle={styles.oneByOneContent}
            showsVerticalScrollIndicator={false}
          >
            {activeQuestion ? (
              <>
                <ExamQuestionItem
                  question={activeQuestion}
                  index={safeIndex}
                  totalQuestions={total}
                  disabled={paused}
                  onSelectChoice={handleSelectChoice}
                  onToggleFlag={handleToggleFlag}
                />

                {/* Previous & Next Buttons */}
                <Row style={styles.oneByOneNavControls}>
                  <Pressable
                    onPress={() => setCurrentIndex(Math.max(0, safeIndex - 1))}
                    disabled={safeIndex <= 0 || paused}
                    accessibilityRole="button"
                    accessibilityLabel="Previous question"
                    style={[
                      styles.oneByOneNavBtn,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <ChevronLeft size={18} color={theme.accentText} strokeWidth={2.2} />
                    <Text numberOfLines={1} style={[styles.oneByOneNavBtnText, { color: theme.accentText }]}>
                      Previous
                    </Text>
                  </Pressable>

                  <Text numberOfLines={1} style={[styles.oneByOneCenterIndex, { color: theme.textSecondary }]}>
                    {`Q. ${safeIndex + 1} of ${total}`}
                  </Text>

                  <Pressable
                    onPress={() => setCurrentIndex(Math.min(questions.length - 1, safeIndex + 1))}
                    disabled={safeIndex >= questions.length - 1 || paused}
                    accessibilityRole="button"
                    accessibilityLabel="Next question"
                    style={[
                      styles.oneByOneNavBtn,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.oneByOneNavBtnText, { color: theme.accentText }]}>
                      Next
                    </Text>
                    <ChevronRight size={18} color={theme.accentText} strokeWidth={2.2} />
                  </Pressable>
                </Row>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>

      {/* 4. Fixed Bottom Bar (Progress Bar + Questions / Submit actions) */}
      <BottomBar
        answeredCount={answered}
        totalQuestions={total}
        flaggedCount={flaggedCount}
        onOpenQuestions={openNavigator}
        onSubmit={openSubmitConfirmation}
        disabled={paused}
      />

      {/* Question Navigator Sheet ("Jump to question") */}
      <QuestionNavigatorSheet
        visible={navigatorOpen}
        onClose={closeNavigator}
        questions={questions}
        answers={answers}
        flags={flags}
        currentIndex={safeIndex}
        initialFilter={navigatorFilter}
        onJumpToQuestion={handleJumpToQuestion}
      />

      {/* Submit Confirmation Dialog */}
      <SubmitConfirmDialog
        visible={submitConfirmOpen}
        answeredCount={answered}
        unansweredCount={unanswered}
        flaggedCount={flaggedCount}
        totalQuestions={total}
        onClose={closeSubmitConfirmation}
        onReview={reviewUnansweredAndFlagged}
        onSubmit={confirmSubmit}
      />

      {/* WiFi Disconnect Overlay */}
      <ExamWifiDisconnectOverlay
        visible={wifiLocked && !roomEnded && !isLeavingExam}
        requiresPin={requiresPin}
        reconnectFailed={reconnectFailed || manualReconnectFailed}
        loading={reconnectLoading}
        error={reconnectError}
        examinationEnded={false}
        wrongNetwork={disconnectReason === 'wrong_network'}
        proctorNetworkChanged={disconnectReason === 'proctor_network_change'}
        graceSecondsRemaining={graceSecondsRemaining ?? undefined}
        onSubmitCode={handleReconnect}
        onRetry={handleProctorNetworkRetry}
        onExitExam={() =>
          void exitToLanding(
            'proctor_unreachable_exit',
            'You left the exam because the proctor could not be reached. Your disconnect was saved on this phone for later sync.',
          )
        }
        onExitEnded={leaveEndedExam}
      />
    </View>
  );
}

export default function ExamScreen() {
  return (
    <ThemeProvider>
      <ExamScreenInner />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  buildStamp: {
    position: 'absolute',
    top: 4,
    right: 8,
    zIndex: 1000000,
    fontSize: 9,
    opacity: 0.7,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  infoAnsweredText: {
    fontSize: 13,
    flexShrink: 1,
    minWidth: 0,
  },
  infoAnsweredBold: {
    fontWeight: '600',
  },
  modeSwitch: {
    height: 32,
    flexShrink: 0,
    borderRadius: 10,
    borderWidth: 1,
    padding: 2,
    flexDirection: 'row',
  },
  modeSegment: {
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: '100%',
  },
  modeSegmentText: {
    fontSize: 12,
    flexShrink: 1,
  },
  questionArea: {
    flex: 1,
  },
  scrollListContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
  },
  oneByOneScroll: {
    flex: 1,
  },
  oneByOneContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
  },
  oneByOneNavControls: {
    justifyContent: 'space-between',
    marginTop: 12,
  },
  oneByOneNavBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 110,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  oneByOneNavBtnText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  oneByOneCenterIndex: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'center',
  },
  iosPrivacyBlackoutShield: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iosPrivacyShieldTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  iosPrivacyShieldSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  iosPrivacyShieldInstruction: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  pinRequiredBlockingShield: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pinRequiredCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  pinRequiredIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pinRequiredTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  pinRequiredSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  pinRequiredInstruction: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  pinRequiredBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinRequiredBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
