import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { RefreshCw, User, Timer } from 'lucide-react-native';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { PracticeBadge } from '@/features/practice/components/PracticeBadge';
import { PracticeTutorialOverlay } from '@/features/practice/components/PracticeTutorialOverlay';
import { usePracticeStore } from '@/features/practice/practiceStore';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

export default function PracticeLobbyScreen() {
  const router = useRouter();
  const theme = useExamineeRedesignTheme();
  const applicant = usePracticeStore((s) => s.applicant);

  const [countdown, setCountdown] = useState(5);
  const [showTutorial, setShowTutorial] = useState(true);

  // 5-second simulated countdown to automatic exam start
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setTimeout(() => {
            router.replace('/practice/exam' as any);
          }, 400);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  const handleExit = () => {
    router.replace('/practice/confirmation' as any);
  };

  return (
    <View style={styles.root}>
      <ExamineeRedesignChrome
        step={3}
        title="Waiting Room"
        stepLabel="Step 4 of 6 · Lobby"
        footer={
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Leave Waiting Room"
              onPress={handleExit}
              style={[styles.secondaryButton, { backgroundColor: theme.secondaryCard }]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                Leave Waiting Room
              </Text>
            </Pressable>
          </View>
        }
      >
        <PracticeBadge
          label="PRACTICE MODE · STEP 4"
          sublabel="Simulated proctor wait · Exam starts automatically in 5s"
        />

        {/* Connection status chip */}
        <View style={[styles.connectionChip, { backgroundColor: theme.successBackground }]}>
          <View style={[styles.connectionDot, { backgroundColor: theme.successText }]} />
          <Text style={[styles.connectionText, { color: theme.successText }]}>
            Proctor connected (Simulated)
          </Text>
        </View>

        {/* Student Identity Card */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <User size={25} color={theme.white} />
            </View>
            <View style={styles.identityCopy}>
              <Text style={[styles.identityName, { color: theme.text }]} numberOfLines={1}>
                {applicant.fullName}
              </Text>
              <Text style={[styles.identityProgram, { color: theme.secondaryText }]} numberOfLines={2}>
                {applicant.programName}
              </Text>
            </View>
          </View>
        </View>

        {/* Session Details Card */}
        <View style={[styles.card, styles.detailsCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: theme.secondaryText }]}>BATCH</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{applicant.batchNumber}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: theme.secondaryText }]}>TIME</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>8:00 AM</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: theme.secondaryText }]}>ROOM</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{applicant.roomName}</Text>
          </View>
        </View>

        {/* Status Card with 5-Second Countdown */}
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: theme.warningBackground,
              borderColor: theme.warningBorder,
            },
          ]}
        >
          <View style={styles.statusHeaderRow}>
            <Text style={[styles.statusTitle, { color: theme.text }]}>
              {countdown > 0 ? 'Please wait for the proctor to start' : 'Entry Authorized!'}
            </Text>
          </View>

          <Text style={[styles.statusBody, { color: theme.secondaryText }]}>
            In the actual exam, you wait in this room until the proctor authorizes everyone to begin. In Practice Mode, your exam launches automatically.
          </Text>

          {/* 5-second countdown highlight block */}
          <View
            style={[
              styles.countdownBlock,
              {
                backgroundColor: theme.card,
                borderColor: theme.warningBorder,
              },
            ]}
          >
            <View style={styles.countdownRow}>
              <Timer size={22} color={theme.orange} />
              <Text style={[styles.countdownLabel, { color: theme.text }]}>
                {countdown > 0
                  ? `Simulating proctor authorization in:`
                  : `Starting Practice Exam...`}
              </Text>
            </View>
            <Text style={[styles.countdownNumber, { color: theme.primary }]}>
              {countdown > 0 ? `${countdown}s` : 'START'}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: theme.cardBorder }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((5 - countdown) / 5) * 100}%`,
                    backgroundColor: theme.primary,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.inlineStatus}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.inlineStatusText, { color: theme.primary }]}>
              {countdown > 0 ? 'Preparing 25 mock questions…' : 'Launching Exam Browser…'}
            </Text>
          </View>
        </View>

        {/* While you wait card */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>While you wait</Text>
          <LobbyWaitRow text="Keep this screen open" theme={theme} />
          <LobbyWaitRow text="Passing score is 75%" theme={theme} />
          <LobbyWaitRow text="Put away other devices" theme={theme} />
        </View>

        {/* Network status row */}
        <View style={[styles.networkRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={[styles.networkDot, { backgroundColor: theme.successText }]} />
          <Text style={[styles.networkText, { color: theme.secondaryText }]}>
            LOCAL LINK ACTIVE (SIMULATED) · 25 MOCK QUESTIONS READY
          </Text>
          <RefreshCw size={15} color={theme.primary} />
        </View>
      </ExamineeRedesignChrome>

      {/* Tutorial Guidance */}
      <PracticeTutorialOverlay
        visible={showTutorial}
        stepNumber={4}
        totalSteps={8}
        title="The Examination Waiting Room"
        description="After joining, all examinees wait in this lobby. When the proctor verifies attendance and clicks 'Start', your screen automatically enters the examination!"
        onNext={() => setShowTutorial(false)}
        onSkip={() => setShowTutorial(false)}
      />
    </View>
  );
}

function LobbyWaitRow({
  text,
  theme,
}: {
  text: string;
  theme: ReturnType<typeof useExamineeRedesignTheme>;
}) {
  return (
    <View style={styles.waitRow}>
      <Text style={[styles.waitCheck, { color: theme.secondaryText }]}>✓</Text>
      <Text style={[styles.waitText, { color: theme.secondaryText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  connectionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectionText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  card: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 12,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  identityName: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Poppins_700Bold',
  },
  identityProgram: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  detailsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoItem: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Poppins_400Regular',
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Poppins_700Bold',
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 10,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontFamily: 'Poppins_700Bold',
  },
  statusBody: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
  },
  countdownBlock: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countdownLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  countdownNumber: {
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  inlineStatusText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waitCheck: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
  },
  waitText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    gap: 10,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  networkText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
  },
  footer: {
    paddingTop: 8,
  },
  secondaryButton: {
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
});
