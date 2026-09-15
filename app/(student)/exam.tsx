import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudUpload, Moon, Sun, Type, Shield } from 'lucide-react-native';
import { ConfirmationModal, CountdownTimer, QuestionCard } from '@/shared/components/ui';
import { ExamSecurityOverlay } from '@/features/examinations/components/ExamSecurityOverlay';
import { ExamWifiDisconnectOverlay } from '@/features/examinations/components/ExamWifiDisconnectOverlay';
import {
  ExamCategoryNav,
  buildCategoryProgress,
  type CategoryProgress,
} from '@/features/examinations/components/ExamCategoryNav';
import { EXAM_PROCESS_STEPS } from '@/shared/theme/examProcess';
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
import type { ChoiceKey } from '@/shared/types';

const FONT_MIN = 0.9;
const FONT_MAX = 1.35;
const FONT_STEP = 0.1;

export default function ExamScreen() {
  useKeepAwake();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const categoryY = useRef<Record<string, number>>({});
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [roomEnded, setRoomEnded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
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

  useEffect(() => {
    if (!activeCategory && categories[0]) {
      setActiveCategory(categories[0].key);
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    console.log('[STUDENT] Exam Screen Opened');
    void ExamLifecycle.apply('ACTIVE');
    void LobbyRepository.acknowledgeStart('entered');
  }, []);

  // Flush local checkpoint when the browser tab is hidden/closed so resume works.
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

  const onWifiDisconnect = useCallback(() => {
    void LobbyRepository.reportWifiDisconnect();
  }, []);

  const { wifiLocked, requiresPin, unlockAfterReconnect } = useWifiExamGate({
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
        // Prefer a hard exit home when the room is over — avoids submit loops
        // while the proctor phone is already offline.
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

  const jumpToCategory = useCallback((category: CategoryProgress) => {
    setActiveCategory(category.key);
    const y = categoryY.current[category.key];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  }, []);

  const jumpNextCategory = useCallback(() => {
    if (!categories.length) return;
    const idx = Math.max(
      0,
      categories.findIndex((c) => c.key === activeCategory),
    );
    const next = categories[Math.min(idx + 1, categories.length - 1)];
    if (next) jumpToCategory(next);
  }, [categories, activeCategory, jumpToCategory]);

  if (!questions.length) return null;

  const appearance = { fontScale, darkMode };
  const screenBg = darkMode ? '#0B0F14' : examProcess.pageBg;
  const ink = darkMode ? '#F3F4F6' : examProcess.ink;
  const muted = darkMode ? '#9CA3AF' : examProcess.muted;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8), backgroundColor: screenBg }]}>
      <View style={styles.topBar}>
        <View style={styles.progress}>
          {EXAM_PROCESS_STEPS.map((label, index) => (
            <View
              key={label}
              style={[styles.progressSeg, index <= 4 && styles.progressSegOn]}
            />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: muted }]}>Step 5 of 6 · Exam</Text>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: ink }]}>Entrance Examination</Text>
          <View style={styles.headerRight}>
            <View style={styles.secureBadge}>
              <Shield size={12} color={examProcess.accent} />
              <Text style={styles.secureText}>{`${violationCount}/${maxViolations}`}</Text>
            </View>
            <CountdownTimer remainingSeconds={remainingSeconds} compact warningThreshold={10} />
          </View>
        </View>
        {remainingSeconds <= 10 && remainingSeconds > 0 ? (
          <View style={styles.timeWarn}>
            <Text style={styles.timeWarnText}>
              {`${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} remaining`}
            </Text>
          </View>
        ) : null}
        <View style={styles.saveRow}>
          <CloudUpload size={14} color={examProcess.okText} />
          <Text style={[styles.saveText, { color: muted }]}>
            {`${answeredCount()} of ${questions.length} answered${
              autoSavedAt
                ? ` · Auto-saved ${new Date(autoSavedAt).toLocaleTimeString()}`
                : ''
            }`}
          </Text>
        </View>

        <View style={[styles.settingsPanel, darkMode && styles.settingsPanelDark]}>
          <View style={styles.settingsGroup}>
            <Type size={14} color={darkMode ? '#93C5FD' : examProcess.accent} />
            <Text style={[styles.settingsLabel, { color: ink }]}>Text</Text>
            <Pressable
              style={styles.settingsBtn}
              onPress={() => setFontScale((v) => Math.max(FONT_MIN, Number((v - FONT_STEP).toFixed(2))))}
              disabled={paused || fontScale <= FONT_MIN}
            >
              <Text style={styles.settingsBtnText}>A−</Text>
            </Pressable>
            <Pressable
              style={styles.settingsBtn}
              onPress={() => setFontScale((v) => Math.min(FONT_MAX, Number((v + FONT_STEP).toFixed(2))))}
              disabled={paused || fontScale >= FONT_MAX}
            >
              <Text style={styles.settingsBtnText}>A+</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.settingsGroup}
            onPress={() => setDarkMode((v) => !v)}
            disabled={paused}
          >
            {darkMode ? (
              <Sun size={14} color="#FBBF24" />
            ) : (
              <Moon size={14} color={examProcess.accent} />
            )}
            <Text style={[styles.settingsLabel, { color: ink }]}>
              {darkMode ? 'Day mode' : 'Night mode'}
            </Text>
          </Pressable>
        </View>
      </View>

      <ExamCategoryNav
        categories={categories}
        activeKey={activeCategory}
        onSelect={jumpToCategory}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
        scrollEnabled={!paused}
        keyboardShouldPersistTaps="handled"
      >
        {questions.map((question, index) => {
          const categoryKey =
            (question.category || question.subjectId || 'General').trim() || 'General';
          const prevCategory =
            index > 0
              ? (questions[index - 1]?.category ||
                  questions[index - 1]?.subjectId ||
                  'General'
                ).trim() || 'General'
              : null;
          const showCategory = categoryKey !== prevCategory;
          return (
            <View
              key={question.id}
              style={styles.questionBlock}
              onLayout={(event) => {
                if (showCategory) {
                  categoryY.current[categoryKey] = event.nativeEvent.layout.y;
                }
              }}
            >
              {showCategory ? (
                <View style={styles.categoryHeadingRow}>
                  <Text style={styles.categoryHeading}>{categoryKey}</Text>
                  <Text style={styles.categoryMeta}>
                    {categories.find((c) => c.key === categoryKey)
                      ? `${categories.find((c) => c.key === categoryKey)!.answered}/${
                          categories.find((c) => c.key === categoryKey)!.total
                        }`
                      : null}
                  </Text>
                </View>
              ) : null}
              <QuestionCard
                question={question}
                selectedAnswer={answers[question.id]?.selectedAnswer ?? null}
                secure
                appearance={appearance}
                onSelect={(choice: ChoiceKey) => {
                  if (paused) return;
                  selectAnswer(question.id, choice);
                  setActiveCategory(categoryKey);
                  if (verifiedStudent?.id) {
                    void LobbyRepository.touchActivity(verifiedStudent.id);
                  }
                }}
              />
            </View>
          );
        })}

        <View style={styles.submitBlock}>
          {categories.length > 1 ? (
            <Pressable style={styles.nextCategory} onPress={jumpNextCategory} disabled={paused}>
              <Text style={styles.nextCategoryText}>Next category</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.submitBtn, paused && styles.submitDisabled]}
            disabled={paused}
            onPress={requestSubmit}
          >
            <Text style={styles.submitBtnText}>Submit Examination</Text>
          </Pressable>
          <Text style={styles.submitHint}>
            Jump categories above, then submit when every question is answered.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={incompleteOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIncompleteOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Unanswered questions</Text>
            <Text style={styles.modalBody}>
              {`Please answer all questions before submitting. Still unanswered: ${
                missingLabel || unansweredCount()
              }.`}
            </Text>
            <Pressable
              style={styles.submitBtn}
              onPress={() => {
                setIncompleteOpen(false);
                const unfinished = categories.find((c) => c.answered < c.total);
                if (unfinished) jumpToCategory(unfinished);
                else scrollRef.current?.scrollTo({ y: 0, animated: true });
              }}
            >
              <Text style={styles.submitBtnText}>Review answers</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={confirmOpen}
        title="Submit Examination?"
        description="Once submitted, you cannot change your answers. Secure Examination Mode will end."
        confirmLabel="Submit Exam"
        cancelLabel="Review Answers"
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
        onSubmitCode={handleReconnect}
        onExitEnded={leaveEndedExam}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: examProcess.pageBg },
  topBar: {
    paddingHorizontal: examProcess.padPage,
    gap: 6,
    marginBottom: 4,
  },
  progress: { flexDirection: 'row', gap: 6 },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: examProcess.radiusProgress,
    backgroundColor: examProcess.progressTrack,
  },
  progressSegOn: { backgroundColor: examProcess.accent },
  stepLabel: { color: examProcess.muted, fontSize: 12 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: examProcess.ink,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF1FD',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: examProcess.radiusControl,
  },
  secureText: { fontSize: 11, fontWeight: '800', color: examProcess.accent },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveText: { fontSize: 11, color: examProcess.muted, fontWeight: '600', flex: 1 },
  settingsPanel: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: examProcess.radiusControl,
    backgroundColor: examProcess.cardElevated,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
  },
  settingsPanelDark: {
    backgroundColor: '#111827',
    borderColor: '#374151',
  },
  settingsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  settingsBtn: {
    minWidth: 34,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: examProcess.white,
    borderWidth: 1,
    borderColor: examProcess.inputBorder,
    paddingHorizontal: 8,
  },
  settingsBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: examProcess.ink,
  },
  timeWarn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: examProcess.radiusControl,
    backgroundColor: examProcess.dangerSoft,
    borderWidth: 1,
    borderColor: examProcess.danger,
  },
  timeWarnText: {
    fontSize: 13,
    fontWeight: '800',
    color: examProcess.danger,
    textAlign: 'center',
  },
  content: { padding: examProcess.padPage, paddingBottom: 40, gap: 14 },
  questionBlock: { gap: 0 },
  categoryHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  categoryHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: examProcess.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  categoryMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: examProcess.muted,
  },
  submitBlock: { marginTop: 8, gap: 10 },
  nextCategory: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  nextCategoryText: {
    color: examProcess.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: examProcess.accent,
    borderRadius: examProcess.radiusControl,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.5 },
  submitBtnText: { color: examProcess.white, fontSize: 14, fontWeight: '700' },
  submitHint: {
    fontSize: 12,
    color: examProcess.muted,
    textAlign: 'center',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: examProcess.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: examProcess.cardBg,
    borderRadius: examProcess.radiusCard,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    padding: 20,
    gap: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: examProcess.ink },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    color: examProcess.muted,
    fontWeight: '500',
  },
});
