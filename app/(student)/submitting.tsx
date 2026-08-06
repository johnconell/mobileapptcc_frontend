import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Loader } from '@/components/ui';
import { LobbyRepository, QuestionRepository } from '@/repositories';
import { ExamProgressStore } from '@/services/examProgressStore';
import { useExamStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

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
  // The exam must be sent once; store objects change identity and would re-fire.
  const submittingRef = useRef(false);

  /** Time-expired and terminated exams are involuntary: never trap the student. */
  const isForcedEnd =
    terminationReason === 'time_expired' ||
    terminationReason === 'policy_violation' ||
    terminationReason === 'proctor_terminated';

  const goHome = useCallback(() => {
    resetExam();
    resetStudent();
    router.replace('/');
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
        markSubmitted(reason);
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

    // Answers were autosaved throughout the exam, so a failed final send must not
    // hold a forced-end student on this screen — close it out and let sync finish it.
    if (isForcedEnd) {
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
    // `attempt` re-runs this on an explicit retry press.
  }, [submit, attempt]);

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorTitle}>Could not submit</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Text style={styles.errorBody}>
          Your answers are saved on this phone. Stay on the exam Wi‑Fi and try again.
        </Text>
        <Button
          title="Try Again"
          fullWidth
          onPress={() => {
            submittingRef.current = false;
            setError(null);
            setAttempt((n) => n + 1);
          }}
          style={styles.btn}
        />
        <Button
          title="Return Home"
          variant="outline"
          fullWidth
          onPress={goHome}
          style={styles.btn}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  note: { fontSize: 13, color: colors.inkMuted, fontWeight: '500' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  errorBody: {
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  btn: { maxWidth: 360, marginTop: 8 },
});
