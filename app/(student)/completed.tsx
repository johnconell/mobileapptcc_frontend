import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui';
import { SuccessIllustration } from '@/features/exam/SuccessIllustration';
import { useExamStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

const AUTO_HOME_SECONDS = 10;

export default function CompletedScreen() {
  const router = useRouter();
  const resetExam = useExamStore((s) => s.reset);
  const terminationReason = useExamStore((s) => s.terminationReason);
  const resetStudent = useStudentStore((s) => s.reset);

  const terminated =
    terminationReason === 'policy_violation' || terminationReason === 'proctor_terminated';
  const timeExpired = terminationReason === 'time_expired';

  const goHome = React.useCallback(() => {
    resetExam();
    resetStudent();
    router.replace('/');
  }, [resetExam, resetStudent, router]);

  // Time ran out: hand the phone back to the next examinee without a tap.
  // The tick must stay a pure state update — resetting the stores from inside a
  // setState updater fires while React is rendering and warns.
  const [countdown, setCountdown] = React.useState(AUTO_HOME_SECONDS);

  React.useEffect(() => {
    if (!timeExpired) return undefined;
    if (countdown <= 0) {
      goHome();
      return undefined;
    }
    const id = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [timeExpired, countdown, goHome]);

  return (
    <View style={styles.screen}>
      <SuccessIllustration />
      <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.copy}>
        <Text style={[styles.title, terminated && styles.titleDanger]}>
          {terminated
            ? 'Terminated Due to Policy Violation'
            : timeExpired
              ? 'Time Is Up — Examination Submitted'
              : 'Examination Submitted Successfully'}
        </Text>
        <Text style={styles.note}>
          {terminated
            ? 'Your examination was ended because the maximum number of security warnings was reached. The proctor has been notified.'
            : timeExpired
              ? 'Your time ran out and your answers were submitted automatically. Please wait for the official examination results.'
              : 'Please wait for the official examination results.'}
        </Text>
        {timeExpired ? (
          <Text style={styles.countdown}>Returning to the start in {countdown}s…</Text>
        ) : null}
      </Animated.View>
      <Button
        title="Return Home"
        size="lg"
        fullWidth
        onPress={goHome}
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
  countdown: {
    fontSize: 13,
    color: colors.inkMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  btn: { maxWidth: 360 },
});
