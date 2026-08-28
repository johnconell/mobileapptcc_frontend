import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { CloudUpload, Shield } from 'lucide-react-native';
import {
  Button,
  ConfirmationModal,
  CountdownTimer,
  Header,
  ProgressBar,
  QuestionCard,
} from '@/components/ui';
import { ExamSecurityOverlay } from '@/features/exam/ExamSecurityOverlay';
import { ExamWifiDisconnectOverlay } from '@/features/exam/ExamWifiDisconnectOverlay';
import { useExamStore, useStudentStore } from '@/stores';
import { useExamTimer } from '@/hooks/useExamTimer';
import { useExamSecurity } from '@/hooks/useExamSecurity';
import { useWifiExamGate } from '@/hooks/useWifiExamGate';
import { useLobby } from '@/hooks/useRepositories';
import { LobbyRepository } from '@/repositories';
import { QuestionRepository } from '@/repositories/QuestionRepository';
import { ExamProgressStore } from '@/services/examProgressStore';
import { OfflineStore } from '@/services/offlineStore';
import { colors } from '@/theme';
import type { ChoiceKey } from '@/types';

export default function ExamScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const restoredRef = useRef(false);
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
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const lobbyQuery = useLobby(scannedSessionId ?? undefined);

  const securityEnabled = questions.length > 0;

  useEffect(() => {
    void OfflineStore.isOfflineMode().then(setOfflineMode);
  }, []);

  const onWifiDisconnect = useCallback(() => {
    void LobbyRepository.reportWifiDisconnect();
  }, []);

  const { wifiLocked, requiresPin, unlockAfterReconnect } = useWifiExamGate({
    enabled: securityEnabled && !offlineMode,
    onDisconnect: onWifiDisconnect,
  });

  // LAN autosave: answers live on the proctor host so End Exam can grade them.
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

  // Persist local checkpoint for power-off / restart recovery (debounced).
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

  // Restore checkpoint once after questions load.
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

  // Heartbeat while unlocked on campus Wi‑Fi.
  useEffect(() => {
    if (!securityEnabled || offlineMode || wifiLocked) return;
    const beat = () => {
      void LobbyRepository.sendHeartbeat();
    };
    beat();
    const id = setInterval(beat, 5000);
    return () => clearInterval(id);
  }, [securityEnabled, offlineMode, wifiLocked]);

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
    if (!questions.length) router.replace('/');
  }, [questions.length, router]);

  // Time up / proctor ended: submit even while a security overlay is showing,
  // otherwise a paused student would sit on an expired exam forever.
  useEffect(() => {
    if (autoSubmittedRef.current) return;
    const ended = lobbyQuery.data?.status === 'ended';
    if (questions.length > 0 && (remainingSeconds <= 0 || ended)) {
      autoSubmittedRef.current = true;
      goSubmit('time_expired');
    }
  }, [remainingSeconds, questions.length, lobbyQuery.data?.status, goSubmit]);

  const progress = questions.length ? answeredCount() / questions.length : 0;
  const missingLabel = useMemo(() => {
    const nums = unansweredNumbers();
    if (nums.length === 0) return '';
    if (nums.length <= 12) return nums.join(', ');
    return `${nums.slice(0, 12).join(', ')}… (+${nums.length - 12} more)`;
  }, [answers, questions, unansweredNumbers]);

  if (!questions.length) return null;

  return (
    <View style={styles.screen}>
      <Header
        title="Entrance Examination"
        subtitle="Secure Examination Mode"
        hideBackSlot
        right={
          <View style={styles.headerRight}>
            <View style={styles.secureBadge}>
              <Shield size={12} color={colors.primary} />
              <Text style={styles.secureText}>
                {`${violationCount}/${maxViolations}`}
              </Text>
            </View>
            <CountdownTimer remainingSeconds={remainingSeconds} compact />
          </View>
        }
      />

      <View style={styles.progressWrap}>
        <ProgressBar progress={progress} />
        <View style={styles.saveRow}>
          <CloudUpload size={14} color={colors.success} />
          <Text style={styles.saveText}>
            {`${answeredCount()} of ${questions.length} answered${
              autoSavedAt
                ? ` · Auto-saved ${new Date(autoSavedAt).toLocaleTimeString()}`
                : ''
            }`}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
        scrollEnabled={!paused}
        keyboardShouldPersistTaps="handled"
      >
        {questions.map((question, index) => {
          const prevCategory = index > 0 ? questions[index - 1]?.category : null;
          const showCategory =
            Boolean(question.category) && question.category !== prevCategory;
          return (
            <View key={question.id} style={styles.questionBlock}>
              {showCategory ? (
                <Text style={styles.categoryHeading}>{question.category}</Text>
              ) : null}
              <QuestionCard
                question={question}
                selectedAnswer={answers[question.id]?.selectedAnswer ?? null}
                secure
                onSelect={(choice: ChoiceKey) => {
                  if (paused) return;
                  selectAnswer(question.id, choice);
                  if (verifiedStudent?.id) {
                    void LobbyRepository.touchActivity(verifiedStudent.id);
                  }
                }}
              />
            </View>
          );
        })}

        <View style={styles.submitBlock}>
          <Button
            title="Submit Examination"
            size="lg"
            fullWidth
            disabled={paused}
            onPress={requestSubmit}
          />
          <Text style={styles.submitHint}>
            All questions must be answered before you can submit.
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
            <Button
              title="Review answers"
              fullWidth
              onPress={() => {
                setIncompleteOpen(false);
                scrollRef.current?.scrollTo({ y: 0, animated: true });
              }}
            />
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
        visible={wifiLocked}
        requiresPin={requiresPin}
        loading={reconnectLoading}
        error={reconnectError}
        onSubmitCode={handleReconnect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0D9DC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  secureText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  progressWrap: { paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveText: { fontSize: 11, color: colors.inkMuted, fontWeight: '600', flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  questionBlock: { gap: 0 },
  categoryHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 6,
  },
  submitBlock: { marginTop: 8, gap: 10 },
  submitHint: {
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    fontWeight: '500',
  },
});
