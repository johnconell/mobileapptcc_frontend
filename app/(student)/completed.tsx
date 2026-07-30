import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui';
import { SuccessIllustration } from '@/features/exam/SuccessIllustration';
import { useExamStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

export default function CompletedScreen() {
  const router = useRouter();
  const resetExam = useExamStore((s) => s.reset);
  const terminationReason = useExamStore((s) => s.terminationReason);
  const resetStudent = useStudentStore((s) => s.reset);

  const terminated =
    terminationReason === 'policy_violation' || terminationReason === 'proctor_terminated';

  return (
    <View style={styles.screen}>
      <SuccessIllustration />
      <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.copy}>
        <Text style={[styles.title, terminated && styles.titleDanger]}>
          {terminated
            ? 'Terminated Due to Policy Violation'
            : 'Examination Submitted Successfully'}
        </Text>
        <Text style={styles.note}>
          {terminated
            ? 'Your examination was ended because the maximum number of security warnings was reached. The proctor has been notified.'
            : 'Please wait for the official examination results.'}
        </Text>
      </Animated.View>
      <Button
        title="Return Home"
        size="lg"
        fullWidth
        onPress={() => {
          resetExam();
          resetStudent();
          router.replace('/');
        }}
        style={styles.btn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 24,
  },
  copy: { alignItems: 'center', gap: 10 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 32,
  },
  titleDanger: { color: colors.danger, fontSize: 22 },
  note: {
    fontSize: 15,
    color: colors.inkSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  btn: { maxWidth: 360 },
});
