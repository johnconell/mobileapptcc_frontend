import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
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
  Check,
  ChevronDown,
  Clock,
  CloudUpload,
  Minus,
  Moon,
  Plus,
  Send,
  Shield,
  Sun,
  Type,
  X,
} from 'lucide-react-native';
import { formatTime } from '@/shared/utils';
import { appStorage } from '@/shared/services/storage';
import { ConfirmationModal, CountdownTimer, QuestionCard } from '@/shared/components/ui';
import { ExamSecurityOverlay } from '@/features/examinations/components/ExamSecurityOverlay';
import { ExamWifiDisconnectOverlay } from '@/features/examinations/components/ExamWifiDisconnectOverlay';
import {
  buildCategoryProgress,
  type CategoryProgress,
} from '@/features/examinations/components/ExamCategoryNav';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
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
  const [roomEnded, setRoomEnded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  const [darkMode, setDarkMode] = useState(true);
  const [fontModalOpen, setFontModalOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [kioskBannerDismissed, setKioskBannerDismissed] = useState(false);
  const [violationToast, setViolationToast] = useState<string | null>(null);
  const prevViolationCountRef = useRef(0);

  // Load persisted theme and font scale
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedTheme = await appStorage.getItem('tcc.settings.exam.dark_mode');
        if (active && storedTheme !== null) {
          setDarkMode(storedTheme === 'true');
        }
        const storedScale = await appStorage.getItem('tcc.settings.exam.font_scale');
        if (active && storedScale !== null) {
          const parsed = parseFloat(storedScale);
          if (!isNaN(parsed) && parsed >= FONT_MIN && parsed <= FONT_MAX) {
            setFontScale(parsed);
          }
        }
      } catch {
        /* ignore fallback */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      void appStorage.setItem('tcc.settings.exam.dark_mode', String(next));
      return next;
    });
  }, []);

  const selectFontScale = useCallback((scale: number) => {
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, Number(scale.toFixed(2))));
    setFontScale(clamped);
    void appStorage.setItem('tcc.settings.exam.font_scale', String(clamped));
  }, []);

  const restoredRef = useRef(false);
  const lowTimeWarnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  const questions = useExamStore((s) => s.questions);
  const answers = useExamStore((s) => s.answers);
  const autoSavedAt = useExamStore((s) => s.autoSavedAt);
  const sessionId = useExamStore((s) => s.sessionId);
  const remainingSecondsStore = useExamStore((s) => s.remainingSeconds);
  const startedAt = useExamStore((s) => s.startedAt);
  const selectAnswer = useExamStore((s) => s.selectAnswer);
  const markAutoSaved = useExamStore((s) => s.markAutoSaved);
  const unansweredCount = useExamStore((s) => s.unansweredCount);
  const unansweredNumbers = useExamStore((s) => s.unansweredNumbers);
  const answeredCount = useExamStore((s) => s.answeredCount);
  const setPaused = useExamStore((s) => s.setPaused);
  const markSubmitted = useExamStore((s) => s.markSubmitted);
  const restoreProgress = useExamStore((s) => s.restoreProgress);

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


  // A ref so onWifiDisconnect can call recordViolation which is available only after
  // useExamSecurity is called below. It is assigned once that hook runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordViolationRef = useRef<((type: import('@/shared/types').SecurityViolationType) => Promise<any>) | null>(null);

  const onWifiDisconnect = useCallback(
    (reason: 'wifi_lost' | 'wrong_network' | 'proctor_network_change') => {
      // Proctor-side change is not the student's fault — do not penalise.
      if (reason === 'proctor_network_change') return;

      void LobbyRepository.reportWifiDisconnect();

      // Deliberately connecting to the wrong Wi-Fi network is a security violation.
      if (reason === 'wrong_network') {
        void recordViolationRef.current?.('app_background');
      }
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
        remainingSeconds: remainingSecondsStore,
        startedAt,
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [answers, remainingSecondsStore, sessionId, verifiedStudent?.id, startedAt, questions.length]);

  useEffect(() => {
    if (restoredRef.current || !questions.length || !sessionId || !verifiedStudent?.id) return;
    restoredRef.current = true;
    void ExamProgressStore.load().then((checkpoint) => {
      if (!checkpoint) return;
      if (checkpoint.sessionId !== sessionId) return;
      if (checkpoint.studentId !== verifiedStudent.id) return;
      restoreProgress({
        answers: checkpoint.answers,
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
      const parsed = parseStartPulse(pulse);
      if (cancelled) return;
      if (parsed?.roomStatus === 'ended') {
        await ExamLifecycle.applyFromServer('ended');
        setRoomEnded(true);
        return;
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
    }
  };

  const onMaxViolations = useCallback(() => {
    if (verifiedStudent?.id) {
      void LobbyRepository.finishStudent(verifiedStudent.id, 'policy_violation');
    }
    goSubmit('policy_violation');
  }, [verifiedStudent?.id, goSubmit]);

  const requestSubmit = useCallback(() => {
    if (wifiLocked) return;
    const missing = unansweredNumbers();
    if (missing.length > 0) {
      // Show the incomplete modal — but it now offers "Submit Anyway" too.
      setIncompleteOpen(true);
      return;
    }
    setConfirmOpen(true);
  }, [unansweredNumbers, wifiLocked]);

  const {
    paused: securityPaused,
    warningVisible,
    warningMessage,
    violationCount,
    maxViolations,
    acknowledgeWarning,
    requestSubmitFromWarning,
    capabilities,
    recordViolation,
  } = useExamSecurity({
    enabled: securityEnabled && !wifiLocked,
    sessionId,
    studentId: verifiedStudent?.id ?? null,
    studentName: verifiedStudent?.fullName ?? null,
    onMaxViolations,
    onRequestSubmit: requestSubmit,
  });

  // Wire recordViolation into the ref so onWifiDisconnect (declared earlier) can use it.
  recordViolationRef.current = recordViolation;

  // Auto-pin into Android Screen Pinning (Lock Task Mode) when the exam session is active.
  // On iOS: only AppState transitions are monitored for violations (no Guided Access).
  useExamLock({
    enabled: securityEnabled && !wifiLocked,
    onViolation: (type) => {
      void recordViolation(type);
    },
  });

  const paused = securityPaused || wifiLocked;

  useEffect(() => {
    setPaused(paused);
  }, [paused, setPaused]);

  useEffect(() => {
    if (violationCount > prevViolationCountRef.current) {
      const msg =
        warningMessage ||
        `Warning: Tab switch or window blur detected (${violationCount}/${maxViolations})`;
      setViolationToast(msg);
      const timer = setTimeout(() => {
        setViolationToast(null);
      }, 4000);
      prevViolationCountRef.current = violationCount;
      return () => clearTimeout(timer);
    }
    prevViolationCountRef.current = violationCount;
  }, [violationCount, warningMessage, maxViolations]);

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
      const unlocked = await unlockAfterReconnect();
      if (!unlocked) {
        setReconnectError('Turn Wi‑Fi back on, then enter the reconnect code.');
        setReconnectLoading(false);
        return;
      }
      void LobbyRepository.sendHeartbeat();
      setReconnectLoading(false);
    },
    [unlockAfterReconnect],
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
      }
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : 'Reconnect failed.');
    } finally {
      setReconnectLoading(false);
    }
  }, [unlockAfterReconnect]);

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

  const remainingSeconds = useExamTimer(questions.length > 0 && !paused);

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
    const ended = roomEnded;
    if (questions.length > 0 && (remainingSeconds <= 0 || ended)) {
      autoSubmittedRef.current = true;
      if (ended) {
        void leaveEndedExam();
      } else {
        goSubmit('time_expired');
      }
    }
  }, [remainingSeconds, questions.length, roomEnded, goSubmit, leaveEndedExam]);

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
    const idx = questions.findIndex((q) => !answers[q.id]?.selectedAnswer);
    if (idx >= 0) {
      setIncompleteOpen(false);
      setPickerOpen(false);
      scrollToIndex(idx);
    }
  }, [questions, answers, scrollToIndex]);

  if (!questions.length) return null;

  const p = examUiPalette(darkMode);
  const appearance = { fontScale, darkMode };
  const accentColor = examUi.accent;

  const visibleQuestions = selectedCategoryFilter
    ? questions.filter((q) => categoryKeyOf(q) === selectedCategoryFilter)
    : questions;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8), backgroundColor: p.page }]}>
      <StatusBar hidden={true} />
      {/* Top Bar (Fixed, matching exact 2-row layout from screenshots) */}
      <View style={[styles.topBarFixed, { backgroundColor: p.page }]}>
        <View style={styles.topNavContainer}>
          {/* Row 1: Category pill (left) + Font controls & Theme toggle (right) */}
          <View style={styles.topRowOne}>
            <Pressable
              style={[
                styles.categoryBadgePill,
                {
                  backgroundColor: darkMode ? '#2E2856' : '#E0E7FF',
                },
              ]}
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Filter by category"
            >
              <Text
                style={[
                  styles.categoryBadgeText,
                  { color: darkMode ? '#A5B4FC' : '#4338CA' },
                ]}
              >
                <Text style={styles.categoryBadgePrefix}>Category: </Text>
                {selectedCategoryFilter || activeCategory?.label || 'Algebra'}
              </Text>
            </Pressable>

            <View style={styles.topRightControls}>
              <Pressable
                style={styles.fontStepperBtn}
                onPress={() => selectFontScale(fontScale - FONT_STEP)}
                accessibilityLabel="Decrease font size"
                hitSlop={8}
              >
                <Minus size={15} color={p.ink} strokeWidth={2.5} />
              </Pressable>
              <Pressable
                style={styles.fontCenterBtn}
                onPress={() => setFontModalOpen(true)}
                accessibilityLabel="Adjust font size"
                hitSlop={8}
              >
                <Text style={[styles.fontCenterText, { color: p.ink }]}>A</Text>
              </Pressable>
              <Pressable
                style={styles.fontStepperBtn}
                onPress={() => selectFontScale(fontScale + FONT_STEP)}
                accessibilityLabel="Increase font size"
                hitSlop={8}
              >
                <Plus size={15} color={p.ink} strokeWidth={2.5} />
              </Pressable>
              <Pressable
                style={styles.themeToggleBtn}
                onPress={toggleDarkMode}
                accessibilityLabel={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                hitSlop={8}
              >
                {darkMode ? <Sun size={17} color="#F5F5F7" /> : <Moon size={17} color="#1A1D29" />}
              </Pressable>
            </View>
          </View>

          {/* Row 2: Violations pill (left) + Large Monospace Timer (right) */}
          <View style={styles.topRowTwo}>
            <View
              style={[
                styles.violationsPill,
                {
                  backgroundColor:
                    violationCount === 0
                      ? darkMode
                        ? '#22263A'
                        : '#E2E8F0'
                      : '#DC2626',
                },
              ]}
            >
              <Text
                style={[
                  styles.violationsText,
                  {
                    color:
                      violationCount === 0
                        ? darkMode
                          ? '#94A3B8'
                          : '#64748B'
                        : '#FFFFFF',
                  },
                ]}
              >
                {`Violations: ${violationCount}`}
              </Text>
            </View>

            <Text
              style={[
                styles.timerMonospaceText,
                {
                  color:
                    remainingSeconds <= 60
                      ? darkMode
                        ? examUi.timerDanger.dark
                        : examUi.timerDanger.light
                      : remainingSeconds <= 300
                        ? darkMode
                          ? examUi.timerWarn.dark
                          : examUi.timerWarn.light
                        : p.ink,
                },
              ]}
            >
              {formatTime(remainingSeconds) || '00:00'}
            </Text>
          </View>

          {/* Optional Warning Toast Notification for Violations */}
          {violationToast ? (
            <View
              style={[
                styles.violationToast,
                {
                  backgroundColor:
                    violationCount <= 1 ? 'rgba(245, 197, 24, 0.95)' : 'rgba(231, 76, 60, 0.95)',
                },
              ]}
            >
              <Shield size={14} color="#FFFFFF" />
              <Text style={styles.violationToastText} numberOfLines={2}>
                {violationToast}
              </Text>
              <Pressable onPress={() => setViolationToast(null)} accessibilityLabel="Dismiss">
                <X size={14} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {/* BYOD Screen Pinning Reminder Banner (Android only, shown once, dismissible) */}
      {Platform.OS === 'android' && !capabilities?.kioskNativeLockTask && !kioskBannerDismissed && (
        <View style={[styles.kioskBanner, { backgroundColor: p.topBar }]}>
          <Shield size={14} color="#F59E0B" />
          <Text style={[styles.kioskBannerText, { color: darkMode ? '#FCD34D' : '#92400E' }]}>
            {'Screen Pinning recommended: Recent Apps → Pin this app to block navigation.'}
          </Text>
          <Pressable onPress={() => setKioskBannerDismissed(true)} accessibilityLabel="Dismiss">
            <X size={14} color={p.muted} />
          </Pressable>
        </View>
      )}

      {/* Main Vertically Scrollable Page */}
      <View style={[styles.mainCardSheet, { backgroundColor: p.page }]}>
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
              <Text style={[styles.subjectSubtitle, { color: accentColor }]}>
                {activeCategory?.label || 'Mathematics'}
              </Text>
              <View style={styles.titleRow}>
                <Text style={[styles.examMainTitle, { color: p.ink }]}>
                  Final Examination
                </Text>
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
                    secure
                    appearance={appearance}
                    readerMode
                    onSelect={(choice: ChoiceKey) => {
                      if (paused) return;
                      selectAnswer(question.id, choice);
                      setActiveIndex(index);
                      if (verifiedStudent?.id) {
                        void LobbyRepository.touchActivity(verifiedStudent.id);
                      }
                    }}
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>
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

      {/* Category Selection Modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={[styles.pickerScreen, { paddingTop: Math.max(insets.top, 10), backgroundColor: p.card }]}>
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
                      if (firstItem) scrollToIndex(firstItem.index);
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
                      return (
                        <Pressable
                          key={question.id}
                          onPress={() => {
                            setPickerOpen(false);
                            requestAnimationFrame(() => scrollToIndex(index));
                          }}
                          style={[
                            styles.chapterCell,
                            {
                              backgroundColor: isCurrent
                                ? accentColor
                                : done
                                ? p.pill
                                : p.card,
                              borderColor: done ? accentColor : p.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chapterText,
                              { color: isCurrent ? '#FFFFFF' : done ? accentColor : p.ink },
                            ]}
                          >
                            {localIdx + 1}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Font Size Display Settings Modal */}
      <Modal
        visible={fontModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setFontModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>
            <View style={styles.modalSheetHeader}>
              <Text style={[styles.modalTitleText, { color: p.ink }]}>Font Adjustment</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => setFontModalOpen(false)}
                accessibilityLabel="Close"
              >
                <X size={18} color={p.muted} />
              </Pressable>
            </View>
            <Text style={[styles.modalBodyText, { color: p.muted }]}>
              Adjust the question and answer choices text size app-wide:
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
      </Modal>

      {/* Unanswered Warning Modal — allows "Submit Anyway" OR "Review Questions" */}
      <Modal
        visible={incompleteOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIncompleteOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitleText, { color: p.ink }]}>
              {`You have ${unansweredCount()} unanswered ${unansweredCount() === 1 ? 'question' : 'questions'}. Submit anyway?`}
            </Text>
            <Text style={[styles.modalBodyText, { color: p.muted }]}>
              {`Questions: ${missingLabel || unansweredCount()}\n\nUnanswered items will be scored as 0. You can submit now or go back to answer them.`}
            </Text>
            {/* Primary: submit anyway */}
            <Pressable
              style={[styles.primaryModalBtn, { backgroundColor: examUi.timerDanger.dark }]}
              onPress={() => {
                setIncompleteOpen(false);
                goSubmit('submitted');
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
      </Modal>

      {/* Final Submit Confirmation Modal */}
      <ConfirmationModal
        visible={confirmOpen}
        title="Submit Examination?"
        description="Are you sure you want to submit your examination? Once submitted, you cannot change your answers."
        confirmLabel="Submit Exam"
        cancelLabel="Keep answering"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          goSubmit('submitted');
        }}
      />

      {/* Security Overlay */}
      <ExamSecurityOverlay
        visible={warningVisible && !wifiLocked}
        violationCount={violationCount}
        maxViolations={maxViolations}
        message={warningMessage}
        onContinue={acknowledgeWarning}
        onSubmit={requestSubmitFromWarning}
      />

      {/* WiFi Disconnect Overlay */}
      <ExamWifiDisconnectOverlay
        visible={wifiLocked || roomEnded}
        requiresPin={requiresPin}
        loading={reconnectLoading}
        error={reconnectError}
        examinationEnded={roomEnded}
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
  },
  categoryBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  categoryBadgePrefix: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
  },
  categoryBadgeText: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fontStepperBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontCenterBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontCenterText: {
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  themeToggleBtn: {
    padding: 4,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRowTwo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  violationsPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationsText: {
    fontSize: 12,
    fontFamily: examProcess.fontSemiBold,
    letterSpacing: 0.2,
  },
  timerMonospaceText: {
    fontSize: 24,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  violationToast: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  violationToastText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: examProcess.fontMedium,
  },
  kioskBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  kioskBannerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: examProcess.fontMedium,
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
  },
  subjectSubtitle: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  examMainTitle: {
    fontSize: 24,
    fontFamily: examProcess.fontSemiBold,
    letterSpacing: -0.3,
  },
  answeredRatioText: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
    marginBottom: 2,
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    padding: 24,
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
});
