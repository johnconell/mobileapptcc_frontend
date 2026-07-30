import React, { useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Loader } from '@/components/ui';
import { LobbyRepository, QuestionRepository } from '@/repositories';
import { useExamStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

export default function SubmittingScreen() {
  const router = useRouter();
  const answers = useExamStore((s) => s.answers);
  const sessionId = useExamStore((s) => s.sessionId);
  const terminationReason = useExamStore((s) => s.terminationReason);
  const markSubmitting = useExamStore((s) => s.markSubmitting);
  const markSubmitted = useExamStore((s) => s.markSubmitted);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function submit() {
      try {
        markSubmitting(true);
        setError(null);
        const payload = Object.fromEntries(
          Object.values(answers).map((answer) => [answer.questionId, answer.selectedAnswer]),
        );

        await QuestionRepository.submitAnswers({
          sessionId: sessionId ?? 'unknown',
          studentId: verifiedStudent?.id ?? 'unknown',
          answers: payload,
        });

        const reason = terminationReason ?? 'submitted';
        if (verifiedStudent?.id) {
          await LobbyRepository.finishStudent(verifiedStudent.id, reason);
        }

        if (!active) return;
        markSubmitted(reason);
        router.replace('/(student)/completed');
      } catch (err) {
        if (!active) return;
        markSubmitting(false);
        setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      }
    }

    void submit();
    return () => {
      active = false;
    };
  }, [
    answers,
    sessionId,
    verifiedStudent,
    terminationReason,
    markSubmitting,
    markSubmitted,
    router,
  ]);

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorTitle}>Could not submit</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Text
          style={styles.retry}
          onPress={() => {
            setError(null);
            markSubmitting(true);
            // Re-trigger by remounting flow: navigate back to exam then user resubmits,
            // or simply retry current effect via state flip.
            router.replace('/(student)/exam');
          }}
        >
          Go back and try again
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Loader
        label={
          terminationReason === 'policy_violation'
            ? 'Terminating examination…'
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
  retry: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
});
