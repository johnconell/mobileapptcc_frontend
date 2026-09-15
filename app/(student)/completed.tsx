import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ExamProcessButton,
  ExamProcessChrome,
  ExamProcessOk,
} from '@/features/examinations/components/ExamProcessChrome';
import { SuccessIllustration } from '@/features/examinations/components/SuccessIllustration';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { examProcess } from '@/shared/theme/examProcess';

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
    void clearApplicantExamMaterial();
    resetExam();
    resetStudent();
    router.replace('/');
  }, [resetExam, resetStudent, router]);

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
    <ExamProcessChrome step={5} title="Examination complete" stepLabel="Step 6 of 6 · Done">
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
        <ExamProcessOk visible={Boolean(timeExpired)}>
          Returning to the start in {countdown}s…
        </ExamProcessOk>
      </Animated.View>
      <ExamProcessButton title="Return Home" variant="submit" onPress={goHome} />
    </ExamProcessChrome>
  );
}

const styles = StyleSheet.create({
  copy: { alignItems: 'center', gap: 10, marginVertical: 12 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: examProcess.ink,
    textAlign: 'center',
    lineHeight: 24,
  },
  titleDanger: { color: examProcess.error, fontSize: 16 },
  note: {
    fontSize: 13,
    color: examProcess.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
