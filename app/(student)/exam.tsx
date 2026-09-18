import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CloudUpload,
  MoreVertical,
  Shield,
  Type,
  Moon,
  Sun,
} from 'lucide-react-native';
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
import { useWifiExamGate } from '@/features/monitoring/hooks/useWifiExamGate';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QuestionRepository } from '@/features/examinations/repositories/QuestionRepository';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
import { PeerExamClient } from '@/features/examinations/services/peerExamClient';
import { parseStartPulse } from '@/features/examinations/services/examStartCoordinator';
import { playExamTimeWarning } from '@/features/examinations/services/examTimeWarning';
import { examProcess } from '@/shared/theme/examProcess';
import type { ChoiceKey, Question } from '@/shared/types';

const FONT_MIN = 0.9;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [roomEnded, setRoomEnded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  const [darkMode, setDarkMode] = useState(true);
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
  const progressPct = total > 0 ? Math.round((answered / total) * 100) : 0;
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, questions.length - 1));
  const activeQuestion = questions[safeIndex] ?? null;
  const activeCategoryKey = activeQuestion ? categoryKeyOf(activeQuestion) : categories[0]?.key;
  const activeCategory = categories.find((c) => c.key === activeCategoryKey) ?? categories[0];

  const localNumberInCategory = useMemo(() => {
    if (!activeQuestion || !activeCategoryKey) return 1;
    const list = questionsByCategory.get(activeCategoryKey) ?? [];
    const found = list.findIndex((item) => item.question.id === activeQuestion.id);
    return found >= 0 ? found + 1 : 1;
  }, [activeQuestion, activeCategoryKey, questionsByCategory]);

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

  const onWifiDisconnect = useCallback((reason: 'wifi_lost' | 'proctor_network_change') => {
    if (reason === 'proctor_network_change') return;
    void LobbyRepository.reportWifiDisconnect();
  }, []);

  const { wifiLocked, requiresPin, unlockAfterReconnect, disconnectReason } = useWifiExamGate({
    enabled: securityEnabled,
    onDisconnect: onWifiDisconnect,
  });

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
  }, [
    answers,
    remainingSecondsStore,
    sessionId,
    verifiedStudent?.id,
    startedAt,
    questions.length,
  ]);

  useEffect(() => {
    if (
      restoredRef.current ||
      !questions.length ||
      !sessionId ||
      !verifiedStudent?.id
    ) {
      return;
    }
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
  }, [
    questions.length,
    sessionId,
    verifiedStudent?.id,
    restoreProgress,
    markAutoSaved,
  ]);

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
    const id = setInterval(() => {
      void beat();
    }, 5000);
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
  } = useExamSecurity({
    enabled: securityEnabled && !wifiLocked,
    sessionId,
    studentId: verifiedStudent?.id ?? null,
    studentName: verifiedStudent?.fullName ?? null,
    onMaxViolations,
    onRequestSubmit: requestSubmit,
  });

  const paused = securityPaused || wifiLocked;

  useEffect(() => {
    setPaused(paused);
  }, [paused, setPaused]);

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
      if (actionType === 'REPLACE' || actionType === 'RESET') {
        return;
      }
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
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated });
      }
    },
    [questions],
  );

  const openPicker = useCallback(() => {
    setExpandedCategory(activeCategoryKey ?? categories[0]?.key ?? null);
    setPickerOpen(true);
  }, [activeCategoryKey, categories]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y + 80;
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

  const appearance = { fontScale, darkMode };
  const screenBg = darkMode ? '#0A0A0A' : examProcess.pageBg;
  const ink = darkMode ? '#F4F4F5' : examProcess.ink;
  const muted = darkMode ? '#A1A1AA' : examProcess.muted;
  const barBg = darkMode ? '#141414' : examProcess.cardBg;
  const barBorder = darkMode ? '#2A2A2A' : examProcess.cardBorder;
  const pillBg = darkMode ? '#1C1C1E' : '#FFFFFF';
  const pickerBg = darkMode ? '#0A0A0A' : examProcess.pageBg;
  const chapterIdleBg = darkMode ? '#1C1C1E' : '#FFFFFF';
  const chapterDoneBg = darkMode ? '#1F3A2A' : examProcess.okBg;
  const chapterDoneInk = darkMode ? '#86EFAC' : examProcess.okText;
  const bookExpandedBg = darkMode
    ? 'rgba(122, 31, 43, 0.35)'
    : examProcess.accentSoft;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 6), backgroundColor: screenBg }]}>
      {/* Compact top chrome — Bible-app style */}
      <View style={styles.topBar}>
        <View style={styles.topIcons}>
          <CountdownTimer remainingSeconds={remainingSeconds} compact warningThreshold={300} />
          <View style={styles.secureBadge}>
            <Shield size={12} color={darkMode ? '#C45C6A' : examProcess.accent} />
            <Text style={[styles.secureText, darkMode && { color: '#C45C6A' }]}>
              {`${violationCount}/${maxViolations}`}
            </Text>
          </View>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setDarkMode((v) => !v)}
            disabled={paused}
            accessibilityLabel={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <Sun size={18} color="#FBBF24" />
            ) : (
              <Moon size={18} color={examProcess.accent} />
            )}
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => setSettingsOpen(true)}
            disabled={paused}
            accessibilityLabel="Reading settings"
          >
            <Type size={18} color={muted} />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={requestSubmit}
            disabled={paused}
            accessibilityLabel="Submit examination"
          >
            <MoreVertical size={18} color={muted} />
          </Pressable>
        </View>

        <View style={styles.progressMeta}>
          <Text style={[styles.progressText, { color: muted }]}>
            {answered}/{total} answered · {progressPct}%
          </Text>
          <View style={styles.saveRow}>
            <CloudUpload size={12} color={darkMode ? '#6FBF8A' : examProcess.okText} />
            <Text style={[styles.saveText, { color: muted }]}>
              {autoSavedAt
                ? `Saved ${new Date(autoSavedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Saving…'}
            </Text>
          </View>
        </View>

        {remainingSeconds <= 60 && remainingSeconds > 0 ? (
          <View style={styles.timeWarn}>
            <Text style={styles.timeWarnText}>
              {remainingSeconds <= 10
                ? `${remainingSeconds}s remaining`
                : 'Less than 1 minute remaining'}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Continuous scroll — like reading verses */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 12) + 88 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!paused}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={48}
      >
        {questions.map((question, index) => {
          const key = categoryKeyOf(question);
          const prevKey =
            index > 0 ? categoryKeyOf(questions[index - 1]!) : null;
          const nextKey =
            index < questions.length - 1
              ? categoryKeyOf(questions[index + 1]!)
              : null;
          const showHeading = key !== prevKey;
          const endOfCategory = key !== nextKey;
          return (
            <View
              key={question.id}
              onLayout={(event: LayoutChangeEvent) => {
                questionY.current[question.id] = event.nativeEvent.layout.y;
              }}
              style={[
                styles.questionBlock,
                endOfCategory && styles.questionBlockCategoryEnd,
              ]}
            >
              {showHeading ? (
                <Text style={[styles.sectionHeading, { color: muted }]}>{key}</Text>
              ) : null}
              <QuestionCard
                question={question}
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
              {endOfCategory ? (
                <View style={styles.categoryEnd}>
                  <View
                    style={[styles.categoryEndLine, { backgroundColor: barBorder }]}
                  />
                  <Text style={[styles.categoryEndText, { color: muted }]}>
                    End of {key}
                  </Text>
                  <View
                    style={[styles.categoryEndLine, { backgroundColor: barBorder }]}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={styles.endBlock}>
          <Pressable
            style={[styles.submitPill, paused && styles.disabled]}
            disabled={paused}
            onPress={requestSubmit}
          >
            <Text style={styles.submitPillText}>Submit Examination</Text>
          </Pressable>
          <Text style={[styles.endHint, { color: muted }]}>
            Scroll through questions, or tap the category below to jump.
          </Text>
        </View>
      </ScrollView>

      {/* Floating category button — YouVersion style */}
      <View
        pointerEvents="box-none"
        style={[
          styles.floatingDock,
          { paddingBottom: Math.max(insets.bottom, 14) },
        ]}
      >
        <Pressable
          style={[
            styles.categoryPill,
            {
              backgroundColor: pillBg,
              borderColor: barBorder,
              shadowColor: darkMode ? '#000' : '#2C241C',
            },
          ]}
          onPress={openPicker}
          disabled={paused}
          accessibilityLabel="Choose category and question"
        >
          <Text style={[styles.categoryPillText, { color: ink }]} numberOfLines={1}>
            {activeCategory?.label || 'Questions'} {localNumberInCategory}
          </Text>
        </Pressable>
      </View>

      {/* Category + question grid picker (Books / chapters style) */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View
          style={[
            styles.pickerScreen,
            { paddingTop: Math.max(insets.top, 10), backgroundColor: pickerBg },
          ]}
        >
          <View style={styles.pickerHeader}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setPickerOpen(false)}
              accessibilityLabel="Back"
            >
              <ArrowLeft size={22} color={ink} />
            </Pressable>
            <Text style={[styles.pickerTitle, { color: ink }]}>Categories</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.pickerList}
            showsVerticalScrollIndicator={false}
          >
            {categories.map((category: CategoryProgress) => {
              const expanded = expandedCategory === category.key;
              const items = questionsByCategory.get(category.key) ?? [];
              return (
                <View key={category.key}>
                  <Pressable
                    style={[
                      styles.bookRow,
                      expanded && { backgroundColor: bookExpandedBg },
                    ]}
                    onPress={() =>
                      setExpandedCategory((cur) =>
                        cur === category.key ? null : category.key,
                      )
                    }
                  >
                    <Text style={[styles.bookLabel, { color: ink }]}>{category.label}</Text>
                    <Text style={[styles.bookMeta, { color: muted }]}>
                      {category.answered}/{category.total}
                    </Text>
                  </Pressable>

                  {expanded ? (
                    <View style={styles.chapterGrid}>
                      {items.map(({ question, index }, localIdx) => {
                        const done = Boolean(answers[question.id]?.selectedAnswer);
                        const current = index === safeIndex;
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
                                backgroundColor: current
                                  ? '#FFFFFF'
                                  : done
                                    ? chapterDoneBg
                                    : chapterIdleBg,
                              },
                              !darkMode && !current && {
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: examProcess.cardBorder,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.chapterText,
                                {
                                  color: current
                                    ? '#111111'
                                    : done
                                      ? chapterDoneInk
                                      : ink,
                                },
                              ]}
                            >
                              {localIdx + 1}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Settings */}
      <Modal
        visible={settingsOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSettingsOpen(false)}>
          <Pressable
            style={[styles.settingsSheet, { backgroundColor: barBg, borderColor: barBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: ink }]}>Reading comfort</Text>
            <View style={styles.settingsRow}>
              <Type size={16} color={darkMode ? '#C45C6A' : examProcess.accent} />
              <Text style={[styles.settingsLabel, { color: ink }]}>Text size</Text>
              <Pressable
                style={[styles.settingsBtn, { borderColor: barBorder }]}
                onPress={() =>
                  setFontScale((v) => Math.max(FONT_MIN, Number((v - FONT_STEP).toFixed(2))))
                }
              >
                <Text style={[styles.settingsBtnText, { color: ink }]}>A−</Text>
              </Pressable>
              <Pressable
                style={[styles.settingsBtn, { borderColor: barBorder }]}
                onPress={() =>
                  setFontScale((v) => Math.min(FONT_MAX, Number((v + FONT_STEP).toFixed(2))))
                }
              >
                <Text style={[styles.settingsBtnText, { color: ink }]}>A+</Text>
              </Pressable>
            </View>
            <Pressable
              style={[
                styles.settingsRow,
                styles.themeToggleRow,
                { backgroundColor: darkMode ? '#1C1C1E' : examProcess.cardElevated },
              ]}
              onPress={() => setDarkMode((v) => !v)}
            >
              {darkMode ? (
                <Sun size={16} color="#FBBF24" />
              ) : (
                <Moon size={16} color={examProcess.accent} />
              )}
              <Text style={[styles.settingsLabel, { color: ink, flex: 1 }]}>
                {darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              </Text>
            </Pressable>
            <Pressable style={styles.submitPill} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.submitPillText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={incompleteOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIncompleteOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: barBg, borderColor: barBorder }]}>
            <Text style={[styles.modalTitle, { color: ink }]}>Unanswered questions</Text>
            <Text style={[styles.modalBody, { color: muted }]}>
              {`Please answer all questions before submitting. Still unanswered: ${
                missingLabel || unansweredCount()
              }.`}
            </Text>
            <Pressable style={styles.submitPill} onPress={jumpToFirstUnanswered}>
              <Text style={styles.submitPillText}>Go to unanswered</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: darkMode ? '#333' : examProcess.accent }]}
              onPress={() => {
                setIncompleteOpen(false);
                openPicker();
              }}
            >
              <Text style={[styles.secondaryBtnText, { color: ink }]}>Open category picker</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={confirmOpen}
        title="Submit Examination?"
        description="Once submitted, you cannot change your answers. Secure Examination Mode will end."
        confirmLabel="Submit Exam"
        cancelLabel="Keep answering"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          goSubmit('submitted');
        }}
      />

      <ExamSecurityOverlay
        visible={warningVisible && !wifiLocked}
        violationCount={violationCount}
        maxViolations={maxViolations}
        message={warningMessage}
        onContinue={acknowledgeWarning}
        onSubmit={requestSubmitFromWarning}
      />

      <ExamWifiDisconnectOverlay
        visible={wifiLocked || roomEnded}
        requiresPin={requiresPin}
        loading={reconnectLoading}
        error={reconnectError}
        examinationEnded={roomEnded}
        proctorNetworkChanged={disconnectReason === 'proctor_network_change'}
        onSubmitCode={handleReconnect}
        onRetry={handleProctorNetworkRetry}
        onExitEnded={leaveEndedExam}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  topBar: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 6,
  },
  topIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(196,92,106,0.15)',
  },
  secureText: {
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
    color: examProcess.accent,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    fontFamily: examProcess.fontMedium,
  },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveText: { fontSize: 11, fontFamily: examProcess.fontRegular },
  timeWarn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(155,28,28,0.2)',
    borderWidth: 1,
    borderColor: '#9B1C1C',
  },
  timeWarnText: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
    color: '#FCA5A5',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  questionBlock: {
    marginBottom: 28,
  },
  questionBlockCategoryEnd: {
    marginBottom: 8,
  },
  sectionHeading: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: examProcess.fontSemiBold,
  },
  categoryEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  categoryEndLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  categoryEndText: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: examProcess.fontMedium,
  },
  endBlock: {
    marginTop: 12,
    gap: 12,
    alignItems: 'center',
  },
  endHint: {
    fontSize: 13,
    textAlign: 'center',
    fontFamily: examProcess.fontRegular,
    maxWidth: 280,
  },
  submitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: examProcess.accent,
    alignSelf: 'stretch',
  },
  submitPillText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  disabled: { opacity: 0.45 },
  floatingDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
    pointerEvents: 'box-none',
  },
  categoryPill: {
    minWidth: '72%',
    maxWidth: 420,
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  categoryPillText: {
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  pickerScreen: { flex: 1 },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  pickerTitle: {
    fontSize: 17,
    fontFamily: examProcess.fontSemiBold,
  },
  pickerList: {
    paddingBottom: 40,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  bookLabel: {
    fontSize: 17,
    fontFamily: examProcess.fontRegular,
  },
  bookMeta: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  chapterCell: {
    width: '17.5%',
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterText: {
    fontSize: 15,
    fontFamily: examProcess.fontSemiBold,
  },
  themeToggleRow: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  settingsSheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  modalSheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: examProcess.fontSemiBold,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: examProcess.fontRegular,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  settingsLabel: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
  },
  settingsBtn: {
    minWidth: 40,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  settingsBtnText: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
  },
});
