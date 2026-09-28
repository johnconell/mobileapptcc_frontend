import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudUpload,
  Layers,
  ListFilter,
  Minus,
  Moon,
  Plus,
  Send,
  ShieldAlert,
  Sun,
  Type,
  X,
} from 'lucide-react-native';
import { formatTime } from '@/shared/utils';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { CountdownTimer, QuestionCard } from '@/shared/components/ui';
import { ExamWifiDisconnectOverlay } from '@/features/examinations/components/ExamWifiDisconnectOverlay';
import {
  buildCategoryProgress,
  ExamCategoryNav,
  type CategoryProgress,
} from '@/features/examinations/components/ExamCategoryNav';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore, type ExamNavMode } from '@/features/examinations/stores/examStore';
import { useExamTimer } from '@/features/examinations/hooks/useExamTimer';
import { useExamSecurity } from '@/features/examinations/hooks/useExamSecurity';
import { useExamLock } from '@/features/examinations/hooks/useExamLock';
import { useWifiExamGate } from '@/features/monitoring/hooks/useWifiExamGate';
import { resolveDisconnectGraceSeconds } from '@/shared/utils/gracePeriod';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QuestionRepository } from '@/features/examinations/repositories/QuestionRepository';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { parseStartPulse } from '@/features/examinations/services/examStartCoordinator';
import { playExamTimeWarning } from '@/features/examinations/services/examTimeWarning';
import { startExamLock, isExamLocked } from '@/features/examinations/services/ExamSecurityService';
import { examProcess } from '@/shared/theme/examProcess';
import { examUi, examUiPalette } from '@/shared/theme/examUi';
import type { ChoiceKey, Question } from '@/shared/types';

const FONT_MIN = 0.85;
const FONT_MAX = 1.35;
const FONT_STEP = 0.1;

function categoryKeyOf(question: Question): string {
  return (question.category || question.subjectId || 'General').trim() || 'General';
}

export default function ExamScreen() {
  useKeepAwake();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const questionY = useRef<Record<string, number>>({});

  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [reconnectPinRequired, setReconnectPinRequired] = useState(false);
  const [roomEnded, setRoomEnded] = useState(false);
  const [proctorEndedModalOpen, setProctorEndedModalOpen] = useState(false);
  const [timeExpiredModalOpen, setTimeExpiredModalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const [fontModalOpen, setFontModalOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [kioskBannerDismissed, setKioskBannerDismissed] = useState(false);
  const [submitConfirmText, setSubmitConfirmText] = useState('');

  const questions = useExamStore((s) => s.questions);
  const answers = useExamStore((s) => s.answers);
  const flags = useExamStore((s) => s.flags);
  const toggleFlag = useExamStore((s) => s.toggleFlag);
  const navMode = useExamStore((s) => s.navMode);
  const setNavMode = useExamStore((s) => s.setNavMode);
  const autoSavedAt = useExamStore((s) => s.autoSavedAt);
  const sessionId = useExamStore((s) => s.sessionId);
  const startedAt = useExamStore((s) => s.startedAt);
  const selectAnswer = useExamStore((s) => s.selectAnswer);
  const markAutoSaved = useExamStore((s) => s.markAutoSaved);
  const unansweredCount = useExamStore((s) => s.unansweredCount);
  const unansweredNumbers = useExamStore((s) => s.unansweredNumbers);
  const answeredCount = useExamStore((s) => s.answeredCount);
  const setPaused = useExamStore((s) => s.setPaused);
  const markSubmitted = useExamStore((s) => s.markSubmitted);
  const restoreProgress = useExamStore((s) => s.restoreProgress);

  // Load persisted theme, font scale, and navigation mode
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedTheme = await appStorage.getItem('tcc.settings.exam.dark_mode');
        if (active && storedTheme === 'true') {
          setDarkMode(true);
        }
        const storedScale = await appStorage.getItem('tcc.settings.exam.font_scale');
        if (active && storedScale !== null) {
          const parsed = parseFloat(storedScale);
          if (!isNaN(parsed) && parsed >= FONT_MIN && parsed <= FONT_MAX) {
            setFontScale(parsed);
          }
        }
        const storedNavMode = await appStorage.getItem('tcc.settings.exam.nav_mode');
        if (active && (storedNavMode === 'one_at_a_time' || storedNavMode === 'scroll')) {
          setNavMode(storedNavMode as ExamNavMode);
        }
      } catch {
        /* ignore fallback */
      }
    })();
    return () => {
      active = false;
    };
  }, [setNavMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      void appStorage.setItem('tcc.settings.exam.dark_mode', String(next));
      return next;
    });
  }, []);

  const toggleNavMode = useCallback(() => {
    const next: ExamNavMode = navMode === 'scroll' ? 'one_at_a_time' : 'scroll';
    setNavMode(next);
    void appStorage.setItem('tcc.settings.exam.nav_mode', next);
  }, [navMode, setNavMode]);

  const selectFontScale = useCallback((scale: number) => {
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, Number(scale.toFixed(2))));
    setFontScale(clamped);
    void appStorage.setItem('tcc.settings.exam.font_scale', String(clamped));
  }, []);

  const restoredRef = useRef(false);
  const lowTimeWarnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);

  const securityEnabled = questions.length > 0;
  const categories = useMemo(
    () => buildCategoryProgress(questions, answers),
    [questions, answers],
  );

  const questionsByCategory = useMemo(() => {
    const map = new Map<string, Array<{ question: Question; index: number }>>();
    questions.forEach((question, index) => {
      const key = categoryKeyOf(question);
      const list = map.get(key) ?? [];
      list.push({ question, index });
      map.set(key, list);
    });
    return map;
  }, [questions]);

  const answered = answeredCount();
  const total = questions.length;
  const progressPct = total > 0 ? (answered / total) * 100 : 0;
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, questions.length - 1));
  const activeQuestion = questions[safeIndex] ?? null;
  const activeCategoryKey = activeQuestion ? categoryKeyOf(activeQuestion) : categories[0]?.key;
  const activeCategory = categories.find((c) => c.key === activeCategoryKey) ?? categories[0];

  useEffect(() => {
    console.log('[STUDENT] Exam Screen Opened');
    void ExamLifecycle.apply('ACTIVE');
    void LobbyRepository.acknowledgeStart('entered');
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const flush = () => {
      const state = useExamStore.getState();
      const student = useStudentStore.getState().verifiedStudent;
      if (!state.sessionId || !student?.id || !state.questions.length) return;
      void ExamProgressStore.save({
        sessionId: state.sessionId,
        studentId: student.id,
        answers: state.answers,
        remainingSeconds: state.remainingSeconds,
        startedAt: state.startedAt,
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);


  const onWifiDisconnect = useCallback(
    (reason: 'wifi_lost' | 'wrong_network' | 'proctor_network_change') => {
      // Proctor-side change is not the student's fault — do not penalise.
      if (reason === 'proctor_network_change') return;

      void LobbyRepository.reportWifiDisconnect();
    },
    [],
  );

  const [gracePeriodSeconds, setGracePeriodSeconds] = useState(120);

  useEffect(() => {
    void resolveDisconnectGraceSeconds().then((val) => {
      if (typeof val === 'number' && val > 0) {
        setGracePeriodSeconds(val);
      }
    });
  }, []);

  // onGraceExpired is wired after goSubmit via ref to avoid declaration-order issues.
  const graceExpiredCallbackRef = useRef<() => void>(() => { /* placeholder — replaced below */ });

  const { wifiLocked, requiresPin, unlockAfterReconnect, disconnectReason, graceSecondsRemaining } = useWifiExamGate({
    enabled: securityEnabled,
    onDisconnect: onWifiDisconnect,
    onGraceExpired: () => graceExpiredCallbackRef.current(),
    gracePeriodSeconds,
  });

  // iOS Privacy Blackout Shield: triggers immediately when examinee tries to pull down
  // Notification Center, Control Center, or initiate App Switcher on iPhone/iPad.
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



  // Auto-save answers
  useEffect(() => {
    if (questions.length === 0 || wifiLocked) return;
    const timer = setTimeout(() => {
      const payload = Object.fromEntries(
        Object.values(answers).map((a) => [a.questionId, a.selectedAnswer]),
      );
      void QuestionRepository.saveProgress(payload).then((result) => {
        if (result.saved && result.savedAt) {
          markAutoSaved(result.savedAt);
        }
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, questions.length, markAutoSaved, wifiLocked]);

  useEffect(() => {
    if (!questions.length || !sessionId || !verifiedStudent?.id) return;
    const timer = setTimeout(() => {
      void ExamProgressStore.save({
        sessionId,
        studentId: verifiedStudent.id,
        answers,
        flags,
        navMode,
        remainingSeconds: useExamStore.getState().remainingSeconds,
        startedAt,
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [answers, flags, navMode, sessionId, verifiedStudent?.id, startedAt, questions.length]);

  useEffect(() => {
    if (restoredRef.current || !questions.length || !sessionId || !verifiedStudent?.id) return;
    restoredRef.current = true;
    void ExamProgressStore.load().then((checkpoint) => {
      if (!checkpoint) return;
      if (checkpoint.sessionId !== sessionId) return;
      if (checkpoint.studentId !== verifiedStudent.id) return;
      restoreProgress({
        answers: checkpoint.answers,
        flags: checkpoint.flags,
        navMode: checkpoint.navMode,
        remainingSeconds: checkpoint.remainingSeconds,
        startedAt: checkpoint.startedAt,
      });
      markAutoSaved(checkpoint.savedAt);
    });
  }, [questions.length, sessionId, verifiedStudent?.id, restoreProgress, markAutoSaved]);

  useEffect(() => {
    if (!securityEnabled) return;
    let cancelled = false;
    const beat = async () => {
      const pulse = await LobbyRepository.sendHeartbeat();
      if (pulse.removed || pulse.myStatus === 'terminated') {
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
      const parsed = parseStartPulse(pulse);
      if (cancelled) return;
      if (parsed?.roomStatus === 'terminated') {
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
      if (parsed?.roomStatus === 'ended') {
        await ExamLifecycle.applyFromServer('ended');
        setRoomEnded(true);
        return;
      }
      if (typeof pulse.remainingSeconds === 'number' && pulse.remainingSeconds >= 0) {
        useExamStore.getState().setRemainingSeconds(pulse.remainingSeconds);
      }
      if (!pulse.ok) {
        const global = await PeerExamClient.getGlobalStatus();
        if (!cancelled && global?.roomStatus === 'ended') {
          await ExamLifecycle.applyFromServer('ended');
          setRoomEnded(true);
          return;
        }
        const health = await PeerExamClient.probeHealth();
        if (!cancelled && (health === 'ended' || health === 'idle')) {
          await ExamLifecycle.applyFromServer('ended');
          setRoomEnded(true);
        }
      }
    };
    void beat();
    const id = setInterval(() => { void beat(); }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [securityEnabled]);

  const leaveEndedExam = useCallback(async () => {
    markSubmitted('time_expired');
    void ExamProgressStore.clear();
    try {
      const { clearApplicantExamMaterial } = await import(
        '@/features/applicants/services/applicantExamCleanup'
      );
      await clearApplicantExamMaterial();
    } catch {
      /* ignore */
    }
    await ExamLifecycle.clear();
    useExamStore.getState().reset();
    useStudentStore.getState().reset();
    router.replace('/');
  }, [markSubmitted, router]);

  const handleExitExam = useCallback(() => {
    Alert.alert(
      'Exit Examination',
      'Are you sure you want to leave the examination and return to the main landing page? Your answered progress has been saved locally.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              const state = useExamStore.getState();
              const student = useStudentStore.getState().verifiedStudent;
              if (state.sessionId && student?.id && state.questions.length) {
                await ExamProgressStore.save({
                  sessionId: state.sessionId,
                  studentId: student.id,
                  answers: state.answers,
                  flags: state.flags,
                  navMode: state.navMode,
                  remainingSeconds: state.remainingSeconds,
                  startedAt: state.startedAt,
                });
              }
            } catch {
              /* ignore */
            }
            router.replace('/');
          },
        },
      ],
    );
  }, [router]);

  const goSubmit = useCallback(
    (reason: 'submitted' | 'policy_violation' | 'time_expired' = 'submitted') => {
      markSubmitted(reason);
      void ExamProgressStore.clear();
      router.replace('/(student)/submitting');
    },
    [markSubmitted, router],
  );

  // Wire the grace-period callback now that goSubmit is available.
  graceExpiredCallbackRef.current = () => {
    if (!autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      goSubmit('time_expired');
      setTimeExpiredModalOpen(true);
      setTimeout(() => {
        goSubmit('time_expired');
      }, 2500);
    }
  };

  // Auto-pin into Android Screen Pinning (Lock Task Mode) when the exam session is active.
  const { isKioskActive, requestLock } = useExamLock({
    enabled: securityEnabled && !wifiLocked,
  });

  const isAndroidUnpinned = Platform.OS === 'android' && !isKioskActive;
  const paused = wifiLocked || isAndroidUnpinned;

  useEffect(() => {
    setPaused(paused);
  }, [paused, setPaused]);

  const requestSubmit = useCallback(() => {
    if (paused) return;
    const missing = unansweredNumbers();
    if (missing.length > 0) {
      // Show the incomplete modal — but it now offers "Submit Anyway" too.
      setIncompleteOpen(true);
      return;
    }
    setConfirmOpen(true);
  }, [unansweredNumbers, paused]);

  useExamSecurity({
    enabled: securityEnabled && !wifiLocked,
    sessionId,
    studentId: verifiedStudent?.id ?? null,
    studentName: verifiedStudent?.fullName ?? null,
    onRequestSubmit: requestSubmit,
  });

  /**
   * Re-pins the exam after a wifi reconnect.
   * Returns true if the device is confirmed pinned within 7 seconds.
   * Returns false (and sets reconnectPinRequired=true) if the student tapped "No thanks".
   */
  const enforceRepinAfterReconnect = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      // iOS uses Guided Access — no repinning needed here
      return true;
    }
    setReconnectPinRequired(true);
    try {
      await startExamLock();
    } catch {
      // startExamLock fires the system dialog; errors here are non-fatal
    }
    // Poll for up to 7 seconds to detect if student approved
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 500));
      const locked = await isExamLocked().catch(() => false);
      if (locked) {
        setReconnectPinRequired(false);
        return true;
      }
    }
    // Student chose "No thanks" — stay locked
    setReconnectPinRequired(false);
    return false;
  }, []);

  const handleReconnect = useCallback(
    async (code: string) => {
      setReconnectLoading(true);
      setReconnectError(null);
      const result = await LobbyRepository.reconnectWithCode(code);
      if (!result.ok) {
        setReconnectError(result.message || 'Invalid reconnect code.');
        setReconnectLoading(false);
        return;
      }
      const unlocked = await unlockAfterReconnect(true);
      if (!unlocked) {
        setReconnectError('Turn Wi‑Fi back on, then enter the reconnect code.');
        setReconnectLoading(false);
        return;
      }
      // ── App-pin gate: student MUST approve pinning to continue ──
      const pinned = await enforceRepinAfterReconnect();
      if (!pinned) {
        setReconnectError(
          'App pinning is required to continue the examination. Tap "Reconnect" and approve the App Pinning prompt.',
        );
        setReconnectLoading(false);
        return;
      }
      void LobbyRepository.sendHeartbeat();
      setReconnectLoading(false);
    },
    [unlockAfterReconnect, enforceRepinAfterReconnect],
  );

  const handleProctorNetworkRetry = useCallback(async () => {
    setReconnectLoading(true);
    setReconnectError(null);
    try {
      await PeerExamClient.refreshHostFromCloud();
      const unlocked = await unlockAfterReconnect();
      if (!unlocked) {
        setReconnectError(
          "Still can't reach the proctor phone. Ask the proctor to stay on the exam Wi‑Fi and confirm the lobby is open.",
        );
      } else {
        void LobbyRepository.sendHeartbeat();
        setReconnectLoading(false);
        return;
      }
      // ── App-pin gate: student MUST approve pinning to continue ──
      const pinned = await enforceRepinAfterReconnect();
      if (!pinned) {
        setReconnectError(
          'App pinning is required to continue the examination. Tap "Retry" and approve the App Pinning prompt.',
        );
        setReconnectLoading(false);
        return;
      }
      void LobbyRepository.sendHeartbeat();
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : 'Reconnect failed.');
    } finally {
      setReconnectLoading(false);
    }
  }, [unlockAfterReconnect, enforceRepinAfterReconnect]);

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

  const remainingSeconds = useExamTimer(questions.length > 0);
  const totalDurationSeconds = useExamStore((s) => s.totalDurationSeconds);

  const timerRatio = totalDurationSeconds > 0 ? remainingSeconds / totalDurationSeconds : 1;
  const timerColor = useMemo(() => {
    if (timerRatio >= 0.5) {
      return darkMode ? '#4ADE80' : '#16A34A'; // Green 100-50%
    }
    if (timerRatio >= 0.15) {
      return darkMode ? '#FB923C' : '#EA580C'; // Orange 50-15%
    }
    return darkMode ? '#F87171' : '#DC2626'; // Red 15-1%
  }, [timerRatio, darkMode]);

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
      setProctorEndedModalOpen(true);
      return;
    }
    if (questions.length > 0 && remainingSeconds <= 0) {
      autoSubmittedRef.current = true;
      setTimeExpiredModalOpen(true);
      const timer = setTimeout(() => {
        goSubmit('time_expired');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [remainingSeconds, questions.length, roomEnded, goSubmit]);

  const missingLabel = useMemo(() => {
    const nums = unansweredNumbers();
    if (nums.length === 0) return '';
    if (nums.length <= 12) return nums.join(', ');
    return `${nums.slice(0, 12).join(', ')}… (+${nums.length - 12} more)`;
  }, [answers, questions, unansweredNumbers]);

  const scrollToIndex = useCallback(
    (index: number, animated = true) => {
      const q = questions[index];
      if (!q) return;
      setActiveIndex(index);
      const y = questionY.current[q.id];
      if (typeof y === 'number') {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated });
      }
    },
    [questions],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y + 120;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      questions.forEach((q, index) => {
        const top = questionY.current[q.id];
        if (typeof top !== 'number') return;
        const dist = Math.abs(top - y);
        if (dist < best) {
          best = dist;
          nearest = index;
        }
      });
      if (nearest !== activeIndex) setActiveIndex(nearest);
    },
    [questions, activeIndex],
  );

  const jumpToFirstUnanswered = useCallback(() => {
    setIncompleteOpen(false);
    setSelectedCategoryFilter(null);
    const idx = questions.findIndex((q) => !answers[q.id]?.selectedAnswer);
    if (idx >= 0) {
      setTimeout(() => {
        scrollToIndex(idx);
      }, 150);
    } else {
      setTimeout(() => {
        setPickerOpen(true);
      }, 150);
    }
  }, [questions, answers, scrollToIndex]);

  const handleSelectChoice = useCallback(
    (questionId: string, choice: ChoiceKey, index: number) => {
      if (paused) return;
      selectAnswer(questionId, choice);
      setActiveIndex(index);
      if (verifiedStudent?.id) {
        void LobbyRepository.touchActivity(verifiedStudent.id);
      }
    },
    [paused, selectAnswer, verifiedStudent?.id],
  );

  if (!questions.length) return null;

  const p = useMemo(() => examUiPalette(darkMode), [darkMode]);
  const appearance = useMemo(() => ({ fontScale, darkMode }), [fontScale, darkMode]);
  const accentColor = examUi.accent;

  const visibleQuestions = selectedCategoryFilter
    ? questions.filter((q) => categoryKeyOf(q) === selectedCategoryFilter)
    : questions;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8), backgroundColor: p.page }]}>
      <StatusBar hidden={true} />

      {/* iOS Privacy Blackout Shield (Prevents question viewing during app switcher / notification pulls) */}
      {Platform.OS === 'ios' && isInactiveOrBackground ? (
        <View style={styles.iosPrivacyBlackoutShield} pointerEvents="auto">
          <ShieldAlert size={64} color="#EF4444" strokeWidth={2.2} />
          <Text style={styles.iosPrivacyShieldTitle}>EXAMINATION PRIVACY SHIELD</Text>
          <Text style={styles.iosPrivacyShieldSubtitle}>
            Leaving the examination screen or accessing system drawers is strictly prohibited.
          </Text>
          <Text style={styles.iosPrivacyShieldInstruction}>
            Return to the app immediately and maintain Guided Access.
          </Text>
        </View>
      ) : null}

      {/* Android Mandatory App Pinning Shield: Blocks exam interaction and view if unpinned */}
      {Platform.OS === 'android' && !isKioskActive && !wifiLocked && !roomEnded ? (
        <View style={styles.pinRequiredBlockingShield} pointerEvents="auto">
          <View style={styles.pinRequiredCard}>
            <View style={styles.pinRequiredIconWrap}>
              <ShieldAlert size={48} color="#7C6CF6" strokeWidth={2.2} />
            </View>
            <Text style={styles.pinRequiredTitle}>App Pinning Required</Text>
            <Text style={styles.pinRequiredSubtitle}>
              You must approve App Pinning to continue answering the examination.
            </Text>
            <Text style={styles.pinRequiredInstruction}>
              If you tap &quot;No thanks&quot;, you cannot continue the examination. Please tap &quot;Got it&quot; on the system prompt to proceed.
            </Text>
            <Pressable
              style={styles.pinRequiredBtn}
              onPress={() => void requestLock()}
              accessibilityRole="button"
              accessibilityLabel="Pin Screen & Continue"
            >
              <Text style={styles.pinRequiredBtnText}>Pin Screen &amp; Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Top Bar (Fixed, matching exact 2-row layout from screenshots) */}
      <View style={[styles.topBarFixed, { backgroundColor: p.page }]}>
        <View style={styles.topNavContainer}>
          {/* Row 1: Exit button + Category pill (left) + Nav Mode & Font controls & Theme toggle (right) */}
          <View style={styles.topRowOne}>
            <View style={styles.topLeftControls}>
              <Pressable
                style={[
                  styles.topExitBtn,
                  {
                    backgroundColor: darkMode ? '#1E2235' : '#FFFFFF',
                    borderColor: darkMode ? '#33384F' : '#E2E8F0',
                  },
                ]}
                onPress={handleExitExam}
                accessibilityRole="button"
                accessibilityLabel="Exit Examination"
                hitSlop={6}
              >
                <ChevronLeft size={16} color={darkMode ? '#F87171' : '#DC2626'} strokeWidth={2.4} />
                <Text style={[styles.topExitBtnText, { color: darkMode ? '#F87171' : '#DC2626' }]}>
                  Exit
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.categoryBadgePill,
                  {
                    backgroundColor: darkMode ? '#2E2856' : '#EEF2FF',
                    borderColor: darkMode ? '#4F46E5' : '#C7D2FE',
                  },
                ]}
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Filter by category"
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.categoryBadgeText,
                    { color: darkMode ? '#C7D2FE' : '#4338CA' },
                  ]}
                  numberOfLines={1}
                >
                  <Text style={styles.categoryBadgePrefix}>Category: </Text>
                  {selectedCategoryFilter || activeCategory?.label || 'All'}
                </Text>
                <ChevronDown size={14} color={darkMode ? '#A5B4FC' : '#6366F1'} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.topRightControls}>
              {/* Question Navigation Mode Toggle: Scroll vs 1-by-1 */}
              <Pressable
                style={[
                  styles.navModeToggleBtn,
                  {
                    backgroundColor: navMode === 'one_at_a_time'
                      ? (darkMode ? '#312E81' : '#EEF2FF')
                      : (darkMode ? '#1E2235' : '#FFFFFF'),
                    borderColor: navMode === 'one_at_a_time'
                      ? (darkMode ? '#818CF8' : '#6366F1')
                      : (darkMode ? '#33384F' : '#CBD5E1'),
                  },
                ]}
                onPress={toggleNavMode}
                accessibilityRole="button"
                accessibilityLabel={`Question mode: ${navMode === 'scroll' ? 'Scroll mode' : 'One-at-a-time mode'}. Tap to switch.`}
                hitSlop={6}
              >
                {navMode === 'scroll' ? (
                  <>
                    <ListFilter size={13} color={darkMode ? '#CBD5E1' : '#475569'} />
                    <Text style={[styles.navModeToggleText, { color: darkMode ? '#CBD5E1' : '#475569' }]}>
                      Scroll
                    </Text>
                  </>
                ) : (
                  <>
                    <Layers size={13} color={darkMode ? '#A5B4FC' : '#4338CA'} />
                    <Text style={[styles.navModeToggleText, { color: darkMode ? '#A5B4FC' : '#4338CA', fontFamily: examProcess.fontSemiBold }]}>
                      1-by-1
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Tactile font controls group */}
              <View
                style={[
                  styles.fontControlsGroup,
                  {
                    backgroundColor: darkMode ? '#1E2235' : '#FFFFFF',
                    borderColor: darkMode ? '#33384F' : '#CBD5E1',
                  },
                ]}
              >
                <Pressable
                  style={styles.fontStepperBtn}
                  onPress={() => selectFontScale(fontScale - FONT_STEP)}
                  accessibilityLabel="Decrease font size"
                  hitSlop={6}
                >
                  <Minus size={13} color={p.ink} strokeWidth={2.4} />
                </Pressable>
                <View style={[styles.fontBtnDivider, { backgroundColor: darkMode ? '#33384F' : '#E2E8F0' }]} />
                <Pressable
                  style={styles.fontCenterBtn}
                  onPress={() => setFontModalOpen(true)}
                  accessibilityLabel="Adjust font size"
                  hitSlop={6}
                >
                  <Text style={[styles.fontCenterText, { color: p.ink }]}>A</Text>
                </Pressable>
                <View style={[styles.fontBtnDivider, { backgroundColor: darkMode ? '#33384F' : '#E2E8F0' }]} />
                <Pressable
                  style={styles.fontStepperBtn}
                  onPress={() => selectFontScale(fontScale + FONT_STEP)}
                  accessibilityLabel="Increase font size"
                  hitSlop={6}
                >
                  <Plus size={13} color={p.ink} strokeWidth={2.4} />
                </Pressable>
              </View>

              {/* Tactile Theme Toggle Button */}
              <Pressable
                style={[
                  styles.themeToggleBtn,
                  {
                    backgroundColor: darkMode ? '#1E2235' : '#FFFFFF',
                    borderColor: darkMode ? '#33384F' : '#CBD5E1',
                  },
                ]}
                onPress={toggleDarkMode}
                accessibilityRole="button"
                accessibilityLabel={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                hitSlop={6}
              >
                {darkMode ? <Sun size={15} color="#FBBF24" strokeWidth={2.2} /> : <Moon size={15} color="#4338CA" strokeWidth={2.2} />}
              </Pressable>
            </View>
          </View>

          {/* Row 2: Large Centered Timer */}
          <View style={styles.topRowTwo}>
            <Text
              style={[
                styles.timerMonospaceText,
                { color: timerColor },
              ]}
            >
              {formatTime(remainingSeconds) || '00:00'}
            </Text>
          </View>
        </View>
      </View>

      {/* Thin divider line between top bar and category selector */}
      <View style={[styles.topBarDivider, { backgroundColor: darkMode ? '#22263A' : '#E2E8F0' }]} />

      {/* Category selector buttons with border/background/elevation and live Math (7/15) counts */}
      <ExamCategoryNav
        categories={categories}
        activeKey={selectedCategoryFilter}
        onSelect={(cat) => {
          const nextKey = cat ? cat.key : null;
          setSelectedCategoryFilter(nextKey);
          if (cat) {
            const items = questionsByCategory.get(cat.key);
            if (items && items[0]) {
              setActiveIndex(items[0].index);
              if (navMode === 'scroll') {
                scrollToIndex(items[0].index);
              }
            }
          }
        }}
        darkMode={darkMode}
        showAllOption={true}
        totalQuestions={total}
        totalAnswered={answered}
      />

      {/* Main Content Page: Scroll Mode vs One-at-a-Time Mode */}
      <View style={[styles.mainCardSheet, { backgroundColor: p.page }]}>
        {navMode === 'scroll' ? (
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 20) + 90 },
            ]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!paused}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={48}
          >
            <View style={styles.responsiveContentWrapper}>
              {/* Subject + Title + Answered Count Header */}
              <View style={styles.examHeaderSection}>
                <View style={styles.titleRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[styles.examMainTitle, { color: p.ink }]} numberOfLines={2}>
                      {selectedCategoryFilter || activeCategory?.label || 'Examination'}
                    </Text>
                    <Text style={[styles.examSubtitle, { color: p.muted }]}>
                      College Entrance Test · Scroll Mode
                    </Text>
                  </View>
                  <Text style={[styles.answeredRatioText, { color: p.muted }]}>
                    {`${answered}/${total} answered`}
                  </Text>
                </View>
              </View>

              {visibleQuestions.map((question, index) => {
                const key = categoryKeyOf(question);
                const prevKey = index > 0 ? categoryKeyOf(visibleQuestions[index - 1]!) : null;
                const showHeading = (key !== prevKey || index === 0) && !selectedCategoryFilter;

                return (
                  <View
                    key={question.id}
                    onLayout={(event: LayoutChangeEvent) => {
                      questionY.current[question.id] = event.nativeEvent.layout.y;
                    }}
                    style={styles.questionBlock}
                  >
                    {showHeading ? (
                      <View style={styles.categoryDividerRow}>
                        <View
                          style={[
                            styles.categoryDividerLine,
                            { backgroundColor: darkMode ? '#2C3044' : '#E2E8F0' },
                          ]}
                        />
                        <Text style={[styles.categoryDividerTitle, { color: p.muted }]}>
                          {key.toUpperCase()}
                        </Text>
                        <View
                          style={[
                            styles.categoryDividerLine,
                            { backgroundColor: darkMode ? '#2C3044' : '#E2E8F0' },
                          ]}
                        />
                      </View>
                    ) : null}

                    <QuestionCard
                      question={question}
                      questionIndex={index}
                      totalQuestions={total}
                      selectedAnswer={answers[question.id]?.selectedAnswer ?? null}
                      isFlagged={Boolean(flags[question.id])}
                      onToggleFlag={() => toggleFlag(question.id)}
                      secure
                      appearance={appearance}
                      readerMode
                      onSelect={(choice: ChoiceKey) => handleSelectChoice(question.id, choice, index)}
                    />
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          /* One-at-a-Time Mode: Single question with Next/Prev and question strip */
          (() => {
            const currentCatQuestions = visibleQuestions;
            const currentCatIdx = Math.max(
              0,
              currentCatQuestions.findIndex((q) => q.id === (questions[safeIndex]?.id || '')) >= 0
                ? currentCatQuestions.findIndex((q) => q.id === (questions[safeIndex]?.id || ''))
                : 0,
            );
            const currentQuestion = currentCatQuestions[currentCatIdx] || questions[safeIndex];
            const currentGlobalIdx = questions.findIndex((q) => q.id === currentQuestion?.id);

            return (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingBottom: Math.max(insets.bottom, 20) + 90 },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.responsiveContentWrapper}>
                  {/* Header in One-at-a-Time Mode */}
                  <View style={styles.examHeaderSection}>
                    <View style={styles.titleRow}>
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={[styles.examMainTitle, { color: p.ink }]} numberOfLines={1}>
                          {selectedCategoryFilter || categoryKeyOf(currentQuestion) || 'Examination'}
                        </Text>
                        <Text style={[styles.examSubtitle, { color: p.muted }]}>
                          {`Question ${currentCatIdx + 1} of ${currentCatQuestions.length} · One-at-a-Time Mode`}
                        </Text>
                      </View>
                      <Text style={[styles.answeredRatioText, { color: p.muted }]}>
                        {`${answered}/${total} answered`}
                      </Text>
                    </View>
                  </View>

                  {/* Quick Question Jump Strip */}
                  <View style={styles.oneAtATimeStripWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {currentCatQuestions.map((q, idx) => {
                        const done = Boolean(answers[q.id]?.selectedAnswer);
                        const isCurrent = idx === currentCatIdx;
                        const isFlagged = Boolean(flags[q.id]);
                        return (
                          <Pressable
                            key={q.id}
                            style={[
                              styles.oneAtATimeStripItem,
                              {
                                backgroundColor: isCurrent
                                  ? accentColor
                                  : isFlagged
                                  ? (darkMode ? '#451A03' : '#FEF3C7')
                                  : done
                                  ? (darkMode ? '#282746' : '#EEF2FF')
                                  : (darkMode ? '#1E2235' : '#FFFFFF'),
                                borderColor: isFlagged
                                  ? (darkMode ? '#F59E0B' : '#D97706')
                                  : isCurrent
                                  ? accentColor
                                  : done
                                  ? (darkMode ? '#6366F1' : '#818CF8')
                                  : p.border,
                              },
                            ]}
                            onPress={() => {
                              const targetGlobalIdx = questions.findIndex((item) => item.id === q.id);
                              if (targetGlobalIdx >= 0) setActiveIndex(targetGlobalIdx);
                            }}
                          >
                            <Text
                              style={[
                                styles.oneAtATimeStripText,
                                {
                                  color: isCurrent
                                    ? '#FFFFFF'
                                    : isFlagged
                                    ? (darkMode ? '#FBBF24' : '#B45309')
                                    : done
                                    ? (darkMode ? '#A5B4FC' : '#4338CA')
                                    : p.ink,
                                },
                              ]}
                            >
                              {idx + 1}
                            </Text>
                            {isFlagged ? <View style={styles.cellFlagDot} /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* The Single QuestionCard */}
                  <QuestionCard
                    question={currentQuestion}
                    questionIndex={currentGlobalIdx >= 0 ? currentGlobalIdx : safeIndex}
                    totalQuestions={total}
                    selectedAnswer={answers[currentQuestion.id]?.selectedAnswer ?? null}
                    isFlagged={Boolean(flags[currentQuestion.id])}
                    onToggleFlag={() => toggleFlag(currentQuestion.id)}
                    secure
                    appearance={appearance}
                    onSelect={(choice: ChoiceKey) =>
                      handleSelectChoice(currentQuestion.id, choice, currentGlobalIdx >= 0 ? currentGlobalIdx : safeIndex)
                    }
                  />

                  {/* Previous / Next Navigation Row */}
                  <View style={styles.oneAtATimeNavRow}>
                    <Pressable
                      style={[
                        styles.oneAtATimeNavBtn,
                        styles.oneAtATimePrevBtn,
                        currentCatIdx === 0 && styles.disabled,
                        {
                          borderColor: darkMode ? '#33384F' : '#CBD5E1',
                          backgroundColor: darkMode ? '#1E2235' : '#FFFFFF',
                        },
                      ]}
                      disabled={currentCatIdx === 0}
                      onPress={() => {
                        if (currentCatIdx > 0) {
                          const prevQ = currentCatQuestions[currentCatIdx - 1];
                          const prevGlobal = questions.findIndex((q) => q.id === prevQ?.id);
                          if (prevGlobal >= 0) setActiveIndex(prevGlobal);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Previous Question"
                    >
                      <ChevronLeft size={18} color={currentCatIdx === 0 ? p.muted : p.ink} />
                      <Text style={[styles.oneAtATimeBtnText, { color: currentCatIdx === 0 ? p.muted : p.ink }]}>
                        Previous
                      </Text>
                    </Pressable>

                    <View style={styles.oneAtATimeCounterWrap}>
                      <Text style={[styles.oneAtATimeCounterText, { color: p.muted }]}>
                        {`${currentCatIdx + 1} / ${currentCatQuestions.length}`}
                      </Text>
                    </View>

                    <Pressable
                      style={[
                        styles.oneAtATimeNavBtn,
                        styles.oneAtATimeNextBtn,
                        { backgroundColor: accentColor },
                      ]}
                      onPress={() => {
                        if (currentCatIdx < currentCatQuestions.length - 1) {
                          const nextQ = currentCatQuestions[currentCatIdx + 1];
                          const nextGlobal = questions.findIndex((q) => q.id === nextQ?.id);
                          if (nextGlobal >= 0) setActiveIndex(nextGlobal);
                        } else {
                          requestSubmit();
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={currentCatIdx < currentCatQuestions.length - 1 ? 'Next Question' : 'Finish & Submit'}
                    >
                      <Text style={styles.oneAtATimeNextBtnText}>
                        {currentCatIdx < currentCatQuestions.length - 1 ? 'Next' : 'Submit'}
                      </Text>
                      {currentCatIdx < currentCatQuestions.length - 1 ? (
                        <ChevronRight size={18} color="#FFFFFF" />
                      ) : (
                        <Send size={15} color="#FFFFFF" />
                      )}
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            );
          })()
        )}
      </View>

      {/* Fixed Bottom Bar: Left Progress track, Right Submit Exam Pill */}
      <View
        style={[
          styles.bottomFixedBar,
          {
            backgroundColor: darkMode ? '#141622' : '#FFFFFF',
            borderTopColor: darkMode ? '#22263A' : '#E2E8F0',
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
          <View style={styles.bottomBarInner}>
            {/* Left side: Progress */}
            <View style={styles.bottomProgressCol}>
              <Text style={[styles.progressLabel, { color: p.muted }]}>Progress</Text>
              <View
                style={[
                  styles.progressBarTrack,
                  { backgroundColor: darkMode ? '#282C40' : '#E2E8F0' },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progressPct}%`, backgroundColor: accentColor },
                  ]}
                />
              </View>
            </View>

            {/* Right side: Submit Exam */}
            <Pressable
              style={[
                styles.submitExamBottomBtn,
                { backgroundColor: accentColor },
                paused && styles.disabled,
              ]}
              onPress={requestSubmit}
              disabled={paused}
              accessibilityLabel="Submit Examination"
            >
              <Send size={16} color="#FFFFFF" />
              <Text style={styles.submitExamBottomBtnText}>Submit Exam</Text>
            </Pressable>
          </View>
        </View>

      {/* Category Selection In-Page View (Instant, 0ms lag) */}
      {pickerOpen ? (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 99998, paddingTop: Math.max(insets.top, 10), backgroundColor: p.card }]}>
          <View style={styles.pickerHeader}>
            <Pressable style={styles.squareBackBtn} onPress={() => setPickerOpen(false)}>
              <ArrowLeft size={20} color={p.ink} />
            </Pressable>
            <Text style={[styles.pickerTitle, { color: p.ink }]}>Categories</Text>
            <Pressable
              onPress={() => {
                setSelectedCategoryFilter(null);
                setPickerOpen(false);
              }}
            >
              <Text style={{ color: accentColor, fontFamily: examProcess.fontSemiBold }}>Show All</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.pickerList} showsVerticalScrollIndicator={false}>
            {/* Legend for question statuses */}
            <View style={styles.gridLegendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.legendText, { color: p.muted }]}>Answered</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: p.border }]} />
                <Text style={[styles.legendText, { color: p.muted }]}>Unanswered</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.legendText, { color: p.muted }]}>Not Sure</Text>
              </View>
            </View>

            {categories.map((category: CategoryProgress) => {
              const items = questionsByCategory.get(category.key) ?? [];
              const isSelected = selectedCategoryFilter === category.key;
              return (
                <View key={category.key} style={styles.categoryPickerSection}>
                  <Pressable
                    style={[
                      styles.categoryRow,
                      isSelected && {
                        backgroundColor: darkMode ? examUi.accentSoftDark : examUi.accentSoftLight,
                      },
                    ]}
                    onPress={() => {
                      setSelectedCategoryFilter(category.key);
                      setPickerOpen(false);
                      const firstItem = items[0];
                      if (firstItem) {
                        setActiveIndex(firstItem.index);
                        if (navMode === 'scroll') {
                          scrollToIndex(firstItem.index);
                        }
                      }
                    }}
                  >
                    <Text style={[styles.categoryRowTitle, { color: p.ink }]}>{category.label}</Text>
                    <Text style={[styles.categoryRowMeta, { color: p.muted }]}>
                      {category.answered}/{category.total} answered
                    </Text>
                  </Pressable>

                  <View style={styles.chapterGrid}>
                    {items.map(({ question, index }, localIdx) => {
                      const done = Boolean(answers[question.id]?.selectedAnswer);
                      const isCurrent = index === safeIndex;
                      const isFlagged = Boolean(flags[question.id]);
                      return (
                        <Pressable
                          key={question.id}
                          onPress={() => {
                            setPickerOpen(false);
                            setActiveIndex(index);
                            if (navMode === 'scroll') {
                              requestAnimationFrame(() => scrollToIndex(index));
                            }
                          }}
                          style={[
                            styles.chapterCell,
                            {
                              backgroundColor: isCurrent
                                ? accentColor
                                : isFlagged
                                ? (darkMode ? '#451A03' : '#FEF3C7')
                                : done
                                ? p.pill
                                : p.card,
                              borderColor: isFlagged
                                ? (darkMode ? '#F59E0B' : '#D97706')
                                : done
                                ? accentColor
                                : p.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chapterText,
                              {
                                color: isCurrent
                                  ? '#FFFFFF'
                                  : isFlagged
                                  ? (darkMode ? '#FBBF24' : '#B45309')
                                  : done
                                  ? accentColor
                                  : p.ink,
                              },
                            ]}
                          >
                            {localIdx + 1}
                          </Text>
                          {isFlagged ? <View style={styles.cellFlagDot} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Font Size & Display Settings Modal */}
      {fontModalOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>
            <View style={styles.modalSheetHeader}>
              <Text style={[styles.modalTitleText, { color: p.ink }]}>Display &amp; Navigation</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setFontModalOpen(false)}
                accessibilityLabel="Close"
              >
                <X size={18} color={p.muted} />
              </Pressable>
            </View>

            {/* Navigation Mode Choice */}
            <Text style={[styles.modalBodyText, { color: p.muted }]}>
              Question display style:
            </Text>
            <View style={styles.navModeModalRow}>
              <Pressable
                style={[
                  styles.navModeOptionCard,
                  {
                    backgroundColor: navMode === 'scroll'
                      ? (darkMode ? examUi.accentSoftDark : examUi.accentSoftLight)
                      : p.pill,
                    borderColor: navMode === 'scroll' ? accentColor : p.border,
                  },
                ]}
                onPress={() => {
                  setNavMode('scroll');
                  void appStorage.setItem('tcc.settings.exam.nav_mode', 'scroll');
                }}
              >
                <ListFilter size={18} color={navMode === 'scroll' ? accentColor : p.muted} />
                <Text
                  style={[
                    styles.navModeOptionTitle,
                    { color: navMode === 'scroll' ? accentColor : p.ink },
                  ]}
                >
                  Scroll Mode
                </Text>
                <Text style={[styles.navModeOptionDesc, { color: p.muted }]}>
                  All questions in current category
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.navModeOptionCard,
                  {
                    backgroundColor: navMode === 'one_at_a_time'
                      ? (darkMode ? examUi.accentSoftDark : examUi.accentSoftLight)
                      : p.pill,
                    borderColor: navMode === 'one_at_a_time' ? accentColor : p.border,
                  },
                ]}
                onPress={() => {
                  setNavMode('one_at_a_time');
                  void appStorage.setItem('tcc.settings.exam.nav_mode', 'one_at_a_time');
                }}
              >
                <Layers size={18} color={navMode === 'one_at_a_time' ? accentColor : p.muted} />
                <Text
                  style={[
                    styles.navModeOptionTitle,
                    { color: navMode === 'one_at_a_time' ? accentColor : p.ink },
                  ]}
                >
                  One-at-a-Time
                </Text>
                <Text style={[styles.navModeOptionDesc, { color: p.muted }]}>
                  Next / Previous buttons
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.modalBodyText, { color: p.muted, marginTop: 8 }]}>
              Adjust text size app-wide:
            </Text>

            <View style={styles.fontOptionGrid}>
              {[
                { label: 'Small', scale: 0.85, preview: '0.85x' },
                { label: 'Medium', scale: 1.0, preview: '1.0x (Standard)' },
                { label: 'Large', scale: 1.15, preview: '1.15x' },
                { label: 'Extra Large', scale: 1.3, preview: '1.3x' },
              ].map((item) => {
                const isSelected = Math.abs(fontScale - item.scale) < 0.05;
                return (
                  <Pressable
                    key={item.label}
                    style={[
                      styles.fontOptionCard,
                      {
                        backgroundColor: isSelected
                          ? (darkMode ? examUi.accentSoftDark : examUi.accentSoftLight)
                          : p.pill,
                        borderColor: isSelected ? accentColor : p.border,
                      },
                    ]}
                    onPress={() => selectFontScale(item.scale)}
                  >
                    <Text
                      style={[
                        styles.fontOptionTitle,
                        {
                          color: isSelected ? accentColor : p.ink,
                          fontSize: 15 * item.scale,
                          fontFamily: isSelected ? examProcess.fontSemiBold : examProcess.fontMedium,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={[styles.fontOptionPreview, { color: p.muted }]}>{item.preview}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.primaryModalBtn, { backgroundColor: accentColor }]}
              onPress={() => setFontModalOpen(false)}
            >
              <Text style={styles.primaryModalBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Unanswered Warning Modal — allows "Submit Anyway" OR "Review Questions" */}
      {incompleteOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitleText, { color: p.ink }]}>
              {`You have ${unansweredCount()} unanswered ${unansweredCount() === 1 ? 'question' : 'questions'}. Submit anyway?`}
            </Text>
            <Text style={[styles.modalBodyText, { color: p.muted }]}>
              {`Questions: ${missingLabel || unansweredCount()}\n\nUnanswered items will be scored as 0. You can submit now or go back to answer them.`}
            </Text>
            {/* Primary: submit anyway -> opens type-to-confirm modal */}
            <Pressable
              style={[styles.primaryModalBtn, { backgroundColor: examUi.timerDanger.dark }]}
              onPress={() => {
                setIncompleteOpen(false);
                setSubmitConfirmText('');
                setConfirmOpen(true);
              }}
            >
              <Text style={styles.primaryModalBtnText}>Submit Anyway</Text>
            </Pressable>
            {/* Secondary: review questions / jump to first unanswered */}
            <Pressable
              style={[styles.secondaryModalBtn, { borderColor: accentColor }]}
              onPress={jumpToFirstUnanswered}
            >
              <Text style={[styles.secondaryModalBtnText, { color: accentColor }]}>Review Questions</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Final Submit Confirmation Modal (Clean Non-Typing Dialog) */}
      {confirmOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitleText, { color: p.ink }]}>Confirm Exam Submission</Text>
            <Text style={[styles.modalBodyText, { color: p.muted }]}>
              {unansweredCount() > 0
                ? `You have ${unansweredCount()} unanswered question(s). Unanswered questions will receive 0 points.\n\n`
                : ''}
              Are you sure you want to finish and submit your examination? Once submitted, your answers are permanently recorded and you cannot return.
            </Text>

            <Pressable
              style={[styles.primaryModalBtn, { backgroundColor: accentColor }]}
              onPress={() => {
                setConfirmOpen(false);
                goSubmit('submitted');
              }}
            >
              <Text style={styles.primaryModalBtnText}>Yes, Submit Exam</Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryModalBtn, { borderColor: p.border }]}
              onPress={() => setConfirmOpen(false)}
            >
              <Text style={[styles.secondaryModalBtnText, { color: p.ink }]}>Keep Answering</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Time Expired Modal */}
      {timeExpiredModalOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1, alignItems: 'center' }]}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Clock size={36} color="#DC2626" strokeWidth={2.2} />
            </View>
            <Text style={[styles.modalTitleText, { color: p.ink, fontSize: 20, textAlign: 'center' }]}>
              Time&apos;s Up!
            </Text>
            <Text style={[styles.modalBodyText, { color: p.muted, textAlign: 'center' }]}>
              The examination time has expired. Your answers have been recorded and your exam is submitting now...
            </Text>
            <Pressable
              style={[styles.primaryModalBtn, { backgroundColor: accentColor, width: '100%', marginTop: 8 }]}
              onPress={() => goSubmit('time_expired')}
            >
              <Text style={styles.primaryModalBtnText}>Submit Now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Proctor Ended Examination Modal */}
      {proctorEndedModalOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1, alignItems: 'center' }]}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <ShieldAlert size={36} color="#4F46E5" strokeWidth={2.2} />
            </View>
            <Text style={[styles.modalTitleText, { color: p.ink, fontSize: 20, textAlign: 'center' }]}>
              The Proctor Has Ended the Exam
            </Text>
            <Text style={[styles.modalBodyText, { color: p.muted, textAlign: 'center' }]}>
              The examination session was concluded by the proctor. Your progress has been saved. Please wait for official updates and results.
            </Text>
            <Pressable
              style={[styles.primaryModalBtn, { backgroundColor: accentColor, width: '100%', marginTop: 8 }]}
              onPress={() => void leaveEndedExam()}
            >
              <Text style={styles.primaryModalBtnText}>Return Home</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* WiFi Disconnect Overlay */}
      <ExamWifiDisconnectOverlay
        visible={wifiLocked && !roomEnded}
        requiresPin={requiresPin}
        loading={reconnectLoading}
        error={reconnectError}
        examinationEnded={false}
        wrongNetwork={disconnectReason === 'wrong_network'}
        proctorNetworkChanged={disconnectReason === 'proctor_network_change'}
        graceSecondsRemaining={graceSecondsRemaining ?? undefined}
        onSubmitCode={handleReconnect}
        onRetry={handleProctorNetworkRetry}
        onExitEnded={leaveEndedExam}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  squareBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarFixed: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  topNavContainer: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    gap: 10,
  },
  topRowOne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topLeftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  topExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  topExitBtnText: {
    fontSize: 12,
    fontFamily: examProcess.fontSemiBold,
  },
  categoryBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 155,
  },
  categoryBadgePrefix: {
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontFamily: examProcess.fontSemiBold,
    flexShrink: 1,
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navModeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    elevation: 1,
  },
  navModeToggleText: {
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
  },
  fontControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 1,
  },
  fontStepperBtn: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontBtnDivider: {
    width: 1,
    height: 16,
  },
  fontCenterBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontCenterText: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
  },
  themeToggleBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  topRowTwo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
  },
  timerMonospaceText: {
    fontSize: 48,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  topBarDivider: {
    height: 1,
  },
  mainCardSheet: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  responsiveContentWrapper: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  examHeaderSection: {
    marginBottom: 16,
    paddingTop: 4,
  },
  subjectSubtitle: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  examMainTitle: {
    fontSize: 28,
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 34,
  },
  examSubtitle: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
    marginTop: 2,
  },
  answeredRatioText: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
    marginTop: 4,
  },
  questionBlock: {
    marginBottom: 20,
  },
  categoryDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    gap: 14,
  },
  categoryDividerLine: {
    flex: 1,
    height: 1,
  },
  categoryDividerTitle: {
    fontSize: 12,
    fontFamily: examProcess.fontSemiBold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bottomFixedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  bottomBarInner: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomProgressCol: {
    flex: 1,
    maxWidth: 220,
    marginRight: 16,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: examProcess.fontSemiBold,
    marginBottom: 6,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  submitExamBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 999,
    paddingHorizontal: 22,
  },
  submitExamBottomBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  disabled: {
    opacity: 0.5,
  },
  pickerScreen: {
    flex: 1,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: examProcess.fontSemiBold,
  },
  pickerList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  categoryPickerSection: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  categoryRowTitle: {
    fontSize: 16,
    fontFamily: examProcess.fontSemiBold,
  },
  categoryRowMeta: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 6,
  },
  chapterCell: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterText: {
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  modalOverlay: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 99999,
  },
  modalSheet: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitleText: {
    fontSize: 18,
    fontFamily: examProcess.fontSemiBold,
  },
  modalBodyText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: examProcess.fontRegular,
  },
  primaryModalBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryModalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  secondaryModalBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  secondaryModalBtnText: {
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalCloseBtn: {
    padding: 4,
  },
  fontOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  fontOptionCard: {
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  fontOptionTitle: {
    fontFamily: examProcess.fontSemiBold,
  },
  fontOptionPreview: {
    fontSize: 11,
    fontFamily: examProcess.fontMedium,
  },
  iosPrivacyBlackoutShield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  iosPrivacyShieldTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  iosPrivacyShieldSubtitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontFamily: examProcess.fontMedium,
    textAlign: 'center',
    lineHeight: 22,
  },
  iosPrivacyShieldInstruction: {
    color: '#94A3B8',
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
    textAlign: 'center',
    marginTop: 8,
  },
  pinRequiredBlockingShield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 12, 20, 0.94)',
    zIndex: 999998,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pinRequiredCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E2235',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#2F3550',
  },
  pinRequiredIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#282746',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#7C6CF6',
  },
  pinRequiredTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  pinRequiredSubtitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontFamily: examProcess.fontMedium,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  pinRequiredInstruction: {
    color: '#F87171',
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  pinRequiredBtn: {
    backgroundColor: '#7C6CF6',
    width: '100%',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinRequiredBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '700',
  },
  navModeModalRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 4,
  },
  navModeOptionCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 6,
  },
  navModeOptionTitle: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
  },
  navModeOptionDesc: {
    fontSize: 11,
    fontFamily: examProcess.fontRegular,
    textAlign: 'center',
  },
  phraseBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: 'center',
    marginVertical: 6,
  },
  phraseBadgeText: {
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  confirmTextInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: examProcess.fontMedium,
    marginVertical: 4,
  },
  cellFlagDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  gridLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
  },
  oneAtATimeNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
    marginBottom: 10,
  },
  oneAtATimeNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    minHeight: 48,
    flex: 1,
  },
  oneAtATimePrevBtn: {
    borderWidth: 1.5,
  },
  oneAtATimeNextBtn: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  oneAtATimeBtnText: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
  },
  oneAtATimeNextBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
  },
  oneAtATimeCounterWrap: {
    paddingHorizontal: 6,
  },
  oneAtATimeCounterText: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
  },
  oneAtATimeStripWrap: {
    marginVertical: 12,
  },
  oneAtATimeStripItem: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginRight: 8,
    position: 'relative',
  },
  oneAtATimeStripText: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
  },
});

