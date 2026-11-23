import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check, Mail, RotateCcw, Home } from 'lucide-react-native';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { PracticeModeChip } from '@/features/practice/components/PracticeModeChip';
import { usePracticeStore } from '@/features/practice/practiceStore';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

export default function PracticeCompletedScreen() {
  const router = useRouter();
  const theme = useExamineeRedesignTheme();
  const answers = usePracticeStore((s) => s.answers);
  const questions = usePracticeStore((s) => s.questions);
  const restartPractice = usePracticeStore((s) => s.restartPractice);
  const resetPractice = usePracticeStore((s) => s.resetPractice);
  const tutorialComplete = usePracticeStore((s) => s.tutorialComplete);
  const replayTutorial = usePracticeStore((s) => s.replayTutorial);

  const answeredCount = Object.values(answers).filter(
    (a) => a && a.selectedAnswer != null,
  ).length;
  const total = questions.length;

  const handleRestart = () => {
    restartPractice();
    router.replace('/practice/scan' as any);
  };

  const handleReturnHome = () => {
    resetPractice();
    router.replace('/' as any);
  };

  const handleReplayTutorial = () => {
    replayTutorial();
    router.replace('/practice/scan' as any);
  };

  const nextSteps = [
    'Proctor syncs the examination results',
    'TCC sends official score to registered Gmail',
    'Follow official college enrollment steps in the email',
  ];

  return (
    <ExamineeRedesignChrome
      step={5}
      title={tutorialComplete ? "You're ready" : ''}
      stepLabel="Step 6 of 6 · Done"
      footer={
        <View style={styles.footerButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tutorialComplete ? 'Replay tutorial' : 'Restart Practice'}
            onPress={tutorialComplete ? handleReplayTutorial : handleRestart}
            style={[
              styles.secondaryButton,
              { backgroundColor: theme.secondaryCard, borderColor: theme.cardBorder },
            ]}
          >
            <RotateCcw size={18} color={theme.text} />
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
              {tutorialComplete ? 'Replay tutorial' : 'Restart Practice'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return Home"
            onPress={handleReturnHome}
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          >
            <Home size={18} color={theme.white} />
            <Text style={[styles.primaryButtonText, { color: theme.white }]}>
              Return Home
            </Text>
          </Pressable>
        </View>
      }
    >
      <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.content}>
        {tutorialComplete ? <PracticeModeChip /> : <PracticeBadge
          label={tutorialComplete ? 'TUTORIAL COMPLETE' : 'PRACTICE COMPLETE · SIMULATION FINISHED'}
          sublabel={tutorialComplete ? 'You know each step of the real exam.' : '25-question walkthrough completed · Ready for the real exam'}
        />}

        <View style={[styles.resultIcon, { backgroundColor: theme.primary }]}>
          <Check size={58} color={theme.gold} strokeWidth={3.2} />
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          {tutorialComplete ? "You're ready" : 'Practice Examination Completed'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
          {tutorialComplete ? 'You know each step of the real exam.' : 'You have successfully experienced the complete examinee workflow!'}
        </Text>

        {/* Practice Stats Card */}
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.secondaryText }]}>
              Questions Answered
            </Text>
            <Text style={[styles.summaryValue, { color: theme.primary }]}>
              {`${answeredCount} of ${total}`}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.secondaryText }]}>
              Practice Status
            </Text>
            <Text style={[styles.summaryValue, { color: theme.successText }]}>
              Completed Successfully
            </Text>
          </View>
        </View>

        {/* Real Exam Result Notice (matching actual completed screen) */}
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
            <Text style={[styles.gmailTitle, { color: theme.text }]}>
              Hintayin ang resulta sa Gmail
            </Text>
            <Text style={[styles.gmailBody, { color: theme.secondaryText }]}>
              In the real examination, official score breakdowns and ranking notices will be sent to your registered Gmail address.
            </Text>
          </View>
        </View>

        {/* What Happens Next Card */}
        <View
          style={[
            styles.nextCard,
            { borderColor: theme.cardBorder, backgroundColor: theme.card },
          ]}
        >
          <Text style={[styles.nextTitle, { color: theme.text }]}>What happens next</Text>
          {nextSteps.map((step, index) => (
            <View key={step} style={styles.nextRow}>
              <View style={[styles.nextNumber, { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.nextNumberText, { color: theme.primary }]}>
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.nextText, { color: theme.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </ExamineeRedesignChrome>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: examineeRedesignLayout.gap,
    paddingTop: 8,
  },
  resultIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    width: '100%',
    fontSize: 26,
    lineHeight: 34,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  subtitle: {
    width: '100%',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  summaryCard: {
    alignSelf: 'stretch',
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    padding: examineeRedesignLayout.cardPadding,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
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
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_700Bold',
  },
  gmailBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  nextCard: {
    alignSelf: 'stretch',
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    padding: examineeRedesignLayout.cardPadding,
    gap: 12,
  },
  nextTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontFamily: 'Poppins_700Bold',
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextNumberText: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
  },
  nextText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
  },
  secondaryButton: {
    flex: 1,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  primaryButton: {
    flex: 1,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
  },
});
