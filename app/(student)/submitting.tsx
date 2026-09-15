import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ExamProcessButton,
  ExamProcessChrome,
} from '@/features/examinations/components/ExamProcessChrome';
import { Loader } from '@/shared/components/ui';
import { QuestionRepository } from '@/features/examinations/repositories/QuestionRepository';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { ExamProgressStore } from '@/features/examinations/services/examProgressStore';
import { appStorage } from '@/shared/services/storage';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { examProcess } from '@/shared/theme/examProcess';

const MAX_ATTEMPTS = 3;

export default function SubmittingScreen() {
  const router = useRouter();
  const answers = useExamStore((s) => s.answers);
  const sessionId = useExamStore((s) => s.sessionId);
  const terminationReason = useExamStore((s) => s.terminationReason);
  const markSubmitting = useExamStore((s) => s.markSubmitting);
  const markSubmitted = useExamStore((s) => s.markSubmitted);
  const resetExam = useExamStore((s) => s.reset);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const resetStudent = useStudentStore((s) => s.reset);

  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const submittingRef = useRef(false);

  const isForcedEnd =
    terminationReason === 'time_expired' ||
    terminationReason === 'policy_violation' ||
    terminationReason === 'proctor_terminated';

  const goHome = useCallback(() => {
    void (async () => {
      try {
        await clearApplicantExamMaterial();
      } catch {
        /* ignore */
      }
      resetExam();
      resetStudent();
      router.replace('/');
    })();
  }, [resetExam, resetStudent, router]);

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;

    const reason = terminationReason ?? 'submitted';
    const payload = Object.fromEntries(
      Object.values(answers).map((answer) => [answer.questionId, answer.selectedAnswer]),
    );

    markSubmitting(true);
    setError(null);

    let lastError: unknown = null;
    for (let tries = 1; tries <= MAX_ATTEMPTS; tries++) {
      try {
        await QuestionRepository.submitAnswers({
          sessionId: sessionId ?? 'unknown',
          studentId: verifiedStudent?.id ?? 'unknown',
          answers: payload,
        });

        if (verifiedStudent?.id) {
          await LobbyRepository.finishStudent(verifiedStudent.id, reason);
        }

        await ExamProgressStore.clear();
        await clearApplicantExamMaterial();
        markSubmitted(reason);
        try {
          const appCode = verifiedStudent?.studentId || verifiedStudent?.id;
          if (appCode && sessionId) {
            const sid = String(sessionId).replace(/^offline-/, '').split('-')[0];
            await appStorage.setItem(`tcc.student.completed.${sid}.${appCode}`, '1');
          }
        } catch {}
        submittingRef.current = false;
        router.replace('/(student)/completed');
        return;
      } catch (err) {
        lastError = err;
        if (tries < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 1200 * tries));
        }
      }
    }

    submittingRef.current = false;
    markSubmitting(false);

    if (isForcedEnd) {
      await clearApplicantExamMaterial();
      markSubmitted(reason);
      router.replace('/(student)/completed');
      return;
    }

    setError(
      lastError instanceof Error
        ? lastError.message
        : 'Submission failed. Please try again.',
    );
  }, [
    answers,
    sessionId,
    verifiedStudent?.id,
    terminationReason,
    isForcedEnd,
    markSubmitting,
    markSubmitted,
    router,
  ]);

  useEffect(() => {
    void submit();
  }, [submit, attempt]);

  if (error) {
    return (
      <ExamProcessChrome step={5} title="Could not submit" stepLabel="Step 6 of 6 · Done">
        <Text style={styles.body}>{error}</Text>
        <Text style={styles.body}>
          Your answers are saved on this phone. Stay on the exam Wi‑Fi and try again.
        </Text>
        <View style={styles.gap}>
          <ExamProcessButton
            title="Try Again"
            onPress={() => {
              submittingRef.current = false;
              setError(null);
              setAttempt((n) => n + 1);
            }}
          />
        </View>
        <View style={styles.gap}>
          <ExamProcessButton title="Return Home" variant="back" onPress={goHome} />
        </View>
      </ExamProcessChrome>
    );
  }

  return (
    <ExamProcessChrome step={5} title="Submitting" stepLabel="Step 6 of 6 · Done">
      <Loader
        label={
          terminationReason === 'policy_violation'
            ? 'Terminating examination…'
            : terminationReason === 'time_expired'
              ? 'Time is up — submitting your examination…'
              : 'Submitting your examination…'
        }
      />
      <Text style={styles.note}>Please keep this screen open.</Text>
    </ExamProcessChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: examProcess.muted,
    marginBottom: 8,
  },
  note: {
    marginTop: 12,
    fontSize: 13,
    color: examProcess.muted,
    fontWeight: '500',
    textAlign: 'center',
  },
  gap: { marginTop: 10 },
});
