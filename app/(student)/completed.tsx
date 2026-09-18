import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ShieldAlert, Mail } from 'lucide-react-native';
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

const AUTO_HOME_SECONDS = 12;

export default function CompletedScreen() {
  const router = useRouter();
  const resetExam = useExamStore((s) => s.reset);
  const terminationReason = useExamStore((s) => s.terminationReason);
  const resetStudent = useStudentStore((s) => s.reset);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);

  const terminated =
    terminationReason === 'policy_violation' || terminationReason === 'proctor_terminated';
  const timeExpired = terminationReason === 'time_expired';
  const gmailHint =
    verifiedStudent?.email?.includes('@')
      ? verifiedStudent.email
      : 'inyong Gmail';

  const goHome = React.useCallback(() => {
    void clearApplicantExamMaterial();
    resetExam();
    resetStudent();
    router.replace('/');
  }, [resetExam, resetStudent, router]);

  const [countdown, setCountdown] = React.useState(AUTO_HOME_SECONDS);

  React.useEffect(() => {
    // Keep terminated students on this notice longer — they must read it.
    if (terminated) return undefined;
    if (countdown <= 0) {
      goHome();
      return undefined;
    }
    const id = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [terminated, countdown, goHome]);

  return (
    <ExamProcessChrome
      step={5}
      title={terminated ? 'Examination ended' : 'Examination complete'}
      stepLabel="Step 6 of 6 · Done"
    >
      {terminated ? (
        <View style={styles.termIconWrap}>
          <ShieldAlert size={40} color={examProcess.error} />
        </View>
      ) : (
        <SuccessIllustration />
      )}

      <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.copy}>
        <Text style={[styles.title, terminated && styles.titleDanger]}>
          {terminated
            ? terminationReason === 'proctor_terminated'
              ? 'Your Examination Was Ended by the Proctor'
              : 'Your Examination Was Terminated'
            : timeExpired
              ? 'Time Is Up — Examination Submitted'
              : 'Examination Submitted Successfully'}
        </Text>

        {terminated ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Important notice</Text>
            <Text style={styles.noticeBody}>
              {terminationReason === 'proctor_terminated'
                ? 'The proctor ended your examination session. Your answers on this phone were saved for review.'
                : 'Your examination was ended because the maximum number of security warnings was reached. The proctor has been notified.'}
            </Text>
            <Text style={styles.noticeBody}>
              Pakibasa nang mabuti: tapos na ang inyong pagsusulit sa device na ito. Hindi na kayo
              makakabalik sa exam.
            </Text>
          </View>
        ) : null}

        <View style={styles.gmailCard}>
          <Mail size={18} color={examProcess.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.gmailTitle}>Hintayin ang resulta sa Gmail</Text>
            <Text style={styles.gmailBody}>
              Maghihintay lang kayo sa result sa inyong Gmail
              {verifiedStudent?.email?.includes('@') ? ` (${gmailHint})` : ''}. Please wait for
              the official examination result in your Gmail — do not leave until you have read this
              message.
            </Text>
          </View>
        </View>

        <ExamProcessOk visible={!terminated}>
          Returning to the start in {countdown}s…
        </ExamProcessOk>
      </Animated.View>

      <ExamProcessButton
        title={terminated ? 'I Understand — Return Home' : 'Return Home'}
        variant="submit"
        onPress={goHome}
      />
    </ExamProcessChrome>
  );
}

const styles = StyleSheet.create({
  copy: { alignItems: 'center', gap: 12, marginVertical: 12 },
  termIconWrap: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: examProcess.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: examProcess.ink,
    textAlign: 'center',
    lineHeight: 24,
  },
  titleDanger: { color: examProcess.error, fontSize: 17 },
  noticeCard: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: 14,
    gap: 8,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: examProcess.error,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noticeBody: {
    fontSize: 13,
    lineHeight: 19,
    color: examProcess.ink,
    fontWeight: '500',
  },
  gmailCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    backgroundColor: examProcess.cardElevated,
    padding: 14,
  },
  gmailTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: examProcess.ink,
    marginBottom: 4,
  },
  gmailBody: {
    fontSize: 13,
    lineHeight: 19,
    color: examProcess.muted,
    fontWeight: '500',
  },
});
