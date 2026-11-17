import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check, Mail, ShieldAlert } from 'lucide-react-native';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { ExamSubmissionStore } from '@/features/examinations/services/examSubmissionStore';
import { releaseExamSessionRestrictions } from '@/features/examinations/services/examSessionRestrictions';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

export default function CompletedScreen() {
  const router = useRouter();
  const resetExam = useExamStore((s) => s.reset);
  const terminationReason = useExamStore((s) => s.terminationReason);
  const resetStudent = useStudentStore((s) => s.reset);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const theme = useExamineeRedesignTheme();

  const terminated =
    terminationReason === 'policy_violation' || terminationReason === 'proctor_terminated';
  const mustAcknowledgeTermination = terminationReason === 'policy_violation';
  const timeExpired = terminationReason === 'time_expired';
  const gmailHint =
    verifiedStudent?.email?.includes('@')
      ? verifiedStudent.email
      : 'inyong Gmail';

  const goHome = React.useCallback(() => {
    void (async () => {
      try {
        await clearApplicantExamMaterial().catch(() => undefined);
        const submission = await ExamSubmissionStore.load().catch((error) => {
          console.warn('[SUBMISSION] Could not inspect the completed receipt before cleanup:', {
            errorName: error instanceof Error ? error.name : 'StorageError',
          });
          return null;
        });
        if (submission?.status === 'confirmed') {
          await ExamSubmissionStore.clear().catch((error) => {
            console.warn('[SUBMISSION] Confirmed receipt could not be cleared after acknowledgement:', {
              errorName: error instanceof Error ? error.name : 'StorageError',
            });
          });
        }
        resetExam();
        resetStudent();
        router.replace('/');
      } finally {
        await releaseExamSessionRestrictions('session_ended').catch(() => undefined);
      }
    })();
  }, [resetExam, resetStudent, router]);

  const title = terminated
    ? terminationReason === 'proctor_terminated'
      ? 'Your Examination Was Ended by the Proctor'
      : 'Your Examination Was Terminated'
    : timeExpired
      ? 'Time Is Up — Examination Submitted'
      : 'Exam Submitted';

  const subtitle = terminated
    ? null
    : timeExpired
      ? 'Your answers were saved and submitted when the timer reached zero.'
      : 'Your answers were saved and verified.';

  const nextSteps = terminated
    ? [
        'The proctor reviews the saved answers',
        'TCC emails your score if applicable',
        'Follow any instructions in the email',
      ]
    : timeExpired
      ? [
          'Your answers were submitted automatically',
          'The proctor syncs the results',
          'TCC emails your score',
        ]
      : ['Proctor syncs the results', 'TCC emails your score', 'Follow the admission steps in the email'];

  return (
    <ExamineeRedesignChrome
      step={5}
      title=""
      stepLabel="Step 6 of 6 · Done"
      footer={
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={terminated ? 'I Understand and Return Home' : 'Return Home'}
            onPress={goHome}
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: theme.white }]}>
              {terminated ? 'I Understand — Return Home' : 'Return Home'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.content}>
        <View
          style={[
            styles.resultIcon,
            { backgroundColor: terminated ? theme.warningBackground : theme.primary },
          ]}
        >
          {terminated ? (
            <ShieldAlert size={46} color={theme.error} />
          ) : (
            <Check size={58} color={theme.gold} strokeWidth={3.2} />
          )}
        </View>

        <Text style={[styles.title, { color: theme.text }, terminated && { color: theme.error }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>{subtitle}</Text>
        ) : null}

        {terminated ? (
          <View
            style={[
              styles.noticeCard,
              { borderColor: theme.error, backgroundColor: theme.warningBackground },
            ]}
          >
            <Text style={[styles.noticeTitle, { color: theme.error }]}>Important notice</Text>
            <Text style={[styles.noticeBody, { color: theme.text }]}>
              The proctor ended your examination session. Your answers on this phone were saved for review.
            </Text>
            <Text style={[styles.noticeBody, { color: theme.text }]}>
              Pakibasa nang mabuti: tapos na ang inyong pagsusulit sa device na ito. Hindi na kayo
              makakabalik sa exam.
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.gmailCard,
            { borderColor: theme.cardBorder, backgroundColor: theme.secondaryCard },
          ]}
        >
          <View style={[styles.gmailIcon, { backgroundColor: theme.primarySoft }]}>
            <Mail size={22} color={theme.primary} />
          </View>
          <View style={styles.gmailCopy}>
            <Text style={[styles.gmailTitle, { color: theme.text }]}>Hintayin ang resulta sa Gmail</Text>
            <Text style={[styles.gmailBody, { color: theme.secondaryText }]}>
              Maghihintay lang kayo sa result sa inyong Gmail
              {verifiedStudent?.email?.includes('@') ? ` (${gmailHint})` : ''}. Please wait for
              the official examination result in your Gmail — do not leave until you have read this
              message.
            </Text>
          </View>
        </View>

        {!mustAcknowledgeTermination ? (
          <View style={[styles.nextCard, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
            <Text style={[styles.nextTitle, { color: theme.text }]}>What happens next</Text>
            {nextSteps.map((step, index) => (
              <View key={step} style={styles.nextRow}>
                <View style={[styles.nextNumber, { backgroundColor: theme.primarySoft }]}>
                  <Text style={[styles.nextNumberText, { color: theme.primary }]}>{index + 1}</Text>
                </View>
                <Text style={[styles.nextText, { color: theme.text }]}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </ExamineeRedesignChrome>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: examineeRedesignLayout.gap,
    paddingTop: 14,
  },
  resultIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    width: '100%',
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  subtitle: {
    width: '100%',
    fontSize: 17,
    lineHeight: 25,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  noticeCard: {
    alignSelf: 'stretch',
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    padding: examineeRedesignLayout.cardPadding,
    gap: 9,
  },
  noticeTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: 'Poppins_700Bold',
  },
  noticeBody: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  gmailCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    padding: examineeRedesignLayout.cardPadding,
  },
  gmailIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gmailCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  gmailTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: 'Poppins_700Bold',
  },
  gmailBody: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  nextCard: {
    alignSelf: 'stretch',
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    padding: examineeRedesignLayout.cardPadding,
    gap: 14,
  },
  nextTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontFamily: 'Poppins_700Bold',
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextNumberText: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
  },
  nextText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  footer: {
    paddingTop: 16,
  },
  primaryButton: {
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
});
