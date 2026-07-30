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

  useEffect(() => {
    let active = true;

    async function submit() {
      markSubmitting(true);
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
});
