import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  List,
  ShieldAlert,
} from 'lucide-react-native';

import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { ThemeProvider, useTheme } from '@/shared/contexts/ThemeContext';
import {
  BottomBar,
  ExamHeader,
  QuestionCard,
  QuestionNavigatorSheet,
  SubmitConfirmDialog,
  type CategoryItem,
} from '@/shared/components/ui';
import { ExamWifiDisconnectOverlay } from '@/features/examinations/components/ExamWifiDisconnectOverlay';
import { buildCategoryProgress } from '@/features/examinations/components/ExamCategoryNav';
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
import type { ChoiceKey, Question } from '@/shared/types';

function categoryKeyOf(question: Question): string {
  return (question.category || question.subjectId || 'General').trim() || 'General';
}

const ESTIMATED_ITEM_HEIGHT = 380;

function ExamScreenInner() {
  useKeepAwake();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const flatListRef = useRef<FlatList<Question>>(null);

  // Modals & Navigation state
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Network & Lifecycle state
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [reconnectPinRequired, setReconnectPinRequired] = useState(false);
  const [roomEnded, setRoomEnded] = useState(false);
  const [proctorEndedModalOpen, setProctorEndedModalOpen] = useState(false);
  const [timeExpiredModalOpen, setTimeExpiredModalOpen] = useState(false);

  // Store state & selectors
  const questions = useExamStore((s) => s.questions);
  const answers = useExamStore((s) => s.answers);
  const flags = useExamStore((s) => s.flags);
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
  const markSubmitted = useExamStore((s) => s.markSubmitted);
  const restoreProgress = useExamStore((s) => s.restoreProgress);

  const restoredRef = useRef(false);
  const lowTimeWarnedRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const securityEnabled = questions.length > 0;

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

  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, questions.length - 1));
  const activeQuestion = questions[safeIndex] ?? null;

  useEffect(() => {
    console.log('[STUDENT] Exam Screen Opened');
    void ExamLifecycle.apply('ACTIVE');
    void LobbyRepository.acknowledgeStart('entered');
  }, []);

  // Flush answers to local storage on visibility/pagehide
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
        flags: state.flags,
        navMode: state.navMode,
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

  const graceExpiredCallbackRef = useRef<() => void>(() => {});

  const {
    wifiLocked,
    requiresPin,
    unlockAfterReconnect,
    disconnectReason,
    graceSecondsRemaining,
  } = useWifiExamGate({
    enabled: securityEnabled,
    onDisconnect: onWifiDisconnect,
    onGraceExpired: () => graceExpiredCallbackRef.current(),
    gracePeriodSeconds,
  });

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
      void QuestionRepository.saveProgress(payload).then((result) => {
        if (result.saved && result.savedAt) {
          markAutoSaved(result.savedAt);
        }
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [answers, questions.length, markAutoSaved, wifiLocked]);

  // Periodic autosave to local offline store
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

  // Restore progress on mount
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

  // Heartbeat & Timer Sync with proctor
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

    const interval = setInterval(() => {
      void beat();
    }, 4000);
    void beat();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [securityEnabled, router]);

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

  // Android Kiosk Pinning
  const { isKioskActive, requestLock } = useExamLock({
    enabled: securityEnabled && !wifiLocked,
  });

  const isAndroidUnpinned = Platform.OS === 'android' && !isKioskActive;
  const paused = wifiLocked || isAndroidUnpinned;

  useEffect(() => {
    setPaused(paused);
  }, [paused, setPaused]);

  useExamSecurity({
    enabled: securityEnabled && !wifiLocked,
    sessionId,
    studentId: verifiedStudent?.id ?? null,
    studentName: verifiedStudent?.fullName ?? null,
    onRequestSubmit: () => setSubmitConfirmOpen(true),
  });

  const enforceRepinAfterReconnect = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    setReconnectPinRequired(true);
    try {
      await startExamLock();
    } catch {
      /* ignore */
    }
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 500));
      const locked = await isExamLocked().catch(() => false);
      if (locked) {
        setReconnectPinRequired(false);
        return true;
      }
    }
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

  // Answer selection & instant local persistence
  const handleSelectChoice = useCallback(
    (questionId: string, choice: ChoiceKey, index: number) => {
      if (paused) return;
      selectAnswer(questionId, choice);
      setActiveIndex(index);
      if (verifiedStudent?.id) {
        void LobbyRepository.touchActivity(verifiedStudent.id);
        void ExamProgressStore.save({
          sessionId: sessionId || 'default',
          studentId: verifiedStudent.id,
          answers: {
            ...answers,
            [questionId]: { questionId, selectedAnswer: choice, answeredAt: new Date().toISOString() },
          },
          flags,
          navMode,
          remainingSeconds: useExamStore.getState().remainingSeconds,
          startedAt,
        });
      }
    },
    [paused, selectAnswer, verifiedStudent?.id, answers, flags, navMode, sessionId, startedAt],
  );

  const handleToggleFlag = useCallback(
    (questionId: string) => {
      toggleFlag(questionId);
      if (verifiedStudent?.id) {
        void ExamProgressStore.save({
          sessionId: sessionId || 'default',
          studentId: verifiedStudent.id,
          answers,
          flags: {
            ...flags,
            [questionId]: !flags[questionId],
          },
          navMode,
          remainingSeconds: useExamStore.getState().remainingSeconds,
          startedAt,
        });
      }
    },
    [toggleFlag, verifiedStudent?.id, answers, flags, navMode, sessionId, startedAt],
  );

  const handleJumpToQuestion = useCallback(
    (index: number) => {
      setActiveIndex(index);
      if (navMode === 'scroll') {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        }, 50);
      }
    },
    [navMode],
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

  const visibleQuestions = useMemo(() => {
    if (!selectedCategoryFilter || selectedCategoryFilter === 'all') {
      return questions;
    }
    return questions.filter((q) => categoryKeyOf(q) === selectedCategoryFilter);
  }, [questions, selectedCategoryFilter]);

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: ESTIMATED_ITEM_HEIGHT,
      offset: ESTIMATED_ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const renderQuestionItem = useCallback(
    ({ item, index }: { item: Question; index: number }) => {
      const globalIndex = questions.findIndex((q) => q.id === item.id);
      const qNum = item.number ?? (globalIndex >= 0 ? globalIndex + 1 : index + 1);
      return (
        <QuestionCard
          question={item}
          questionNumber={qNum}
          totalQuestions={total}
          selectedAnswer={answers[item.id]?.selectedAnswer ?? null}
          isFlagged={Boolean(flags[item.id])}
          onSelect={(choice) => handleSelectChoice(item.id, choice, globalIndex >= 0 ? globalIndex : index)}
          onToggleFlag={() => handleToggleFlag(item.id)}
          disabled={paused}
        />
      );
    },
    [questions, answers, flags, total, handleSelectChoice, handleToggleFlag, paused],
  );

  if (!questions.length) return null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar hidden={true} />

      {/* iOS Privacy Blackout Shield */}
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

      {/* Android Mandatory App Pinning Shield */}
      {Platform.OS === 'android' && !isKioskActive && !wifiLocked && !roomEnded ? (
        <View style={styles.pinRequiredBlockingShield} pointerEvents="auto">
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
              style={[styles.pinRequiredBtn, { backgroundColor: theme.accent }]}
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
          selectedCategory={selectedCategoryFilter}
          onSelectCategory={handleSelectCategory}
          disabled={paused}
        />
      </View>

      {/* 2. Info Row: "X of 100 answered" on left, "Scroll | One by one" on right */}
      <View style={styles.infoRow}>
        <Text style={[styles.infoAnsweredText, { color: theme.textSecondary }]}>
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
      </View>

      {/* 3. Question Area */}
      <View style={styles.questionArea}>
        {navMode === 'scroll' ? (
          <FlatList
            ref={flatListRef}
            data={visibleQuestions}
            keyExtractor={(item) => item.id}
            renderItem={renderQuestionItem}
            contentContainerStyle={styles.scrollListContent}
            getItemLayout={getItemLayout}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={7}
            onScrollToIndexFailed={(info) => {
              flatListRef.current?.scrollToOffset({
                offset: ESTIMATED_ITEM_HEIGHT * info.index,
                animated: true,
              });
            }}
          />
        ) : (
          <ScrollView
            style={styles.oneByOneScroll}
            contentContainerStyle={styles.oneByOneContent}
            showsVerticalScrollIndicator={false}
          >
            {activeQuestion ? (
              <>
                <QuestionCard
                  question={activeQuestion}
                  questionNumber={activeQuestion.number ?? safeIndex + 1}
                  totalQuestions={total}
                  selectedAnswer={answers[activeQuestion.id]?.selectedAnswer ?? null}
                  isFlagged={Boolean(flags[activeQuestion.id])}
                  onSelect={(choice) => handleSelectChoice(activeQuestion.id, choice, safeIndex)}
                  onToggleFlag={() => handleToggleFlag(activeQuestion.id)}
                  disabled={paused}
                />

                {/* Previous & Next Buttons */}
                <View style={styles.oneByOneNavControls}>
                  <Pressable
                    onPress={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
                    disabled={safeIndex <= 0 || paused}
                    accessibilityRole="button"
                    accessibilityLabel="Previous question"
                    style={({ pressed }) => [
                      styles.oneByOneNavBtn,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                        opacity: safeIndex <= 0 ? 0.4 : pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <ChevronLeft size={18} color={theme.accentText} strokeWidth={2.2} />
                    <Text style={[styles.oneByOneNavBtnText, { color: theme.accentText }]}>
                      Previous
                    </Text>
                  </Pressable>

                  <Text style={[styles.oneByOneCenterIndex, { color: theme.textSecondary }]}>
                    {`Q. ${safeIndex + 1} of ${total}`}
                  </Text>

                  <Pressable
                    onPress={() => setActiveIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                    disabled={safeIndex >= questions.length - 1 || paused}
                    accessibilityRole="button"
                    accessibilityLabel="Next question"
                    style={({ pressed }) => [
                      styles.oneByOneNavBtn,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                        opacity: safeIndex >= questions.length - 1 ? 0.4 : pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.oneByOneNavBtnText, { color: theme.accentText }]}>
                      Next
                    </Text>
                    <ChevronRight size={18} color={theme.accentText} strokeWidth={2.2} />
                  </Pressable>
                </View>
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
        onOpenQuestions={() => setNavigatorOpen(true)}
        onSubmit={() => setSubmitConfirmOpen(true)}
        disabled={paused}
      />

      {/* Question Navigator Sheet ("Jump to question") */}
      <QuestionNavigatorSheet
        visible={navigatorOpen}
        onClose={() => setNavigatorOpen(false)}
        questions={questions}
        answers={answers}
        flags={flags}
        currentIndex={safeIndex}
        onJumpToQuestion={handleJumpToQuestion}
      />

      {/* Submit Confirmation Dialog */}
      <SubmitConfirmDialog
        visible={submitConfirmOpen}
        answeredCount={answered}
        unansweredCount={unanswered}
        flaggedCount={flaggedCount}
        totalQuestions={total}
        onClose={() => setSubmitConfirmOpen(false)}
        onReview={() => {
          setSubmitConfirmOpen(false);
          setNavigatorOpen(true);
        }}
        onSubmit={() => {
          setSubmitConfirmOpen(false);
          goSubmit('submitted');
        }}
      />

      {/* Time Expired Modal */}
      {timeExpiredModalOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: theme.timer.red.bg }]}>
              <Clock size={36} color={theme.timer.red.text} strokeWidth={2.2} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Time&apos;s Up!
            </Text>
            <Text style={[styles.modalDescription, { color: theme.textSecondary }]}>
              The examination time has expired. Your answers have been recorded and your exam is submitting now...
            </Text>
            <Pressable
              style={[styles.modalActionBtn, { backgroundColor: theme.accent }]}
              onPress={() => goSubmit('time_expired')}
              accessibilityRole="button"
              accessibilityLabel="Submit now"
            >
              <Text style={[styles.modalActionBtnText, { color: theme.onAccent }]}>Submit Now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Proctor Ended Examination Modal */}
      {proctorEndedModalOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: theme.accentSoft }]}>
              <ShieldAlert size={36} color={theme.accent} strokeWidth={2.2} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              The Proctor Has Ended the Exam
            </Text>
            <Text style={[styles.modalDescription, { color: theme.textSecondary }]}>
              The examination session was concluded by the proctor. Your progress has been saved. Please wait for official updates and results via Gmail.
            </Text>
            <Pressable
              style={[styles.modalActionBtn, { backgroundColor: theme.accent }]}
              onPress={() => void leaveEndedExam()}
              accessibilityRole="button"
              accessibilityLabel="Return home"
            >
              <Text style={[styles.modalActionBtnText, { color: theme.onAccent }]}>Return Home</Text>
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
  },
  infoAnsweredBold: {
    fontWeight: '600',
  },
  modeSwitch: {
    height: 32,
    borderRadius: 10,
    borderWidth: 0.5,
    padding: 2,
    flexDirection: 'row',
  },
  modeSegment: {
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: '100%',
  },
  modeSegmentText: {
    fontSize: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  oneByOneNavBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    minWidth: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  oneByOneNavBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  oneByOneCenterIndex: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  modalActionBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalActionBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  iosPrivacyBlackoutShield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    zIndex: 999999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iosPrivacyShieldTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  iosPrivacyShieldSubtitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  iosPrivacyShieldInstruction: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  pinRequiredBlockingShield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinRequiredBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
