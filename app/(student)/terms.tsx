import React, { useState } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { ShieldCheck, CheckSquare, Square } from 'lucide-react-native';
import {
  ExamProcessActions,
  ExamProcessButton,
  ExamProcessChrome,
} from '@/features/examinations/components/ExamProcessChrome';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { examProcess } from '@/shared/theme/examProcess';

/**
 * Terms & Agreement Screen
 *
 * Flow: passkey → confirmation → terms (this screen) → lobby
 *
 * Displays the examination rules and requires the student to check "I agree"
 * before proceeding to the waiting lobby.
 *
 * agreedAt is stored locally in studentStore. A fire-and-forget API call also
 * records the agreement server-side via LobbyRepository.recordAgreement().
 */
export default function StudentTermsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [agreed, setAgreed] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const setAgreedAt = useStudentStore((s) => s.setAgreedAt);
  const lobbySnapshot = useLobbyStore((s) => s.snapshot);

  // Block hardware back — students must read and agree.
  React.useEffect(() => {
    navigation.setOptions({ gestureEnabled: false, headerShown: false });
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [navigation]);

  // Guard: must have a verified student to reach this screen.
  React.useEffect(() => {
    if (!verifiedStudent || !scannedSessionId) {
      router.replace('/(student)/passkey');
    }
  }, [verifiedStudent, scannedSessionId, router]);

  const schedName = lobbySnapshot?.schedule?.name ?? 'Entrance Examination';
  const duration = lobbySnapshot?.session?.durationMinutes
    ? `${lobbySnapshot.session.durationMinutes} minutes`
    : '90 minutes';
  const batchLabel = lobbySnapshot?.session?.batchNumber ?? '—';
  const timeLabel = lobbySnapshot?.session?.timeLabel ?? '—';

  const handleProceed = async () => {
    if (!agreed || proceeding) return;
    setProceeding(true);

    // Record agreement locally immediately.
    const ts = new Date().toISOString();
    setAgreedAt(ts);

    // Fire-and-forget server-side recording (non-blocking).
    try {
      const { LobbyRepository } = await import(
        '@/features/lobby/repositories/LobbyRepository'
      );
      void LobbyRepository.recordAgreement();
    } catch {
      // Server recording failure is non-blocking — local record is sufficient.
    }

    router.replace('/(student)/lobby');
  };

  return (
    <ExamProcessChrome
      step={3}
      title="Terms & Agreement"
      stepLabel="Step 4 of 6 · Terms"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Exam Meta */}
        <View style={styles.metaCard}>
          <Text style={styles.metaTitle}>{schedName}</Text>
          <View style={styles.metaRow}>
            <MetaItem label="Batch" value={batchLabel} />
            <MetaItem label="Time" value={timeLabel} />
            <MetaItem label="Duration" value={duration} />
          </View>
        </View>

        {/* Rules Section */}
        <View style={styles.rulesSection}>
          <View style={styles.rulesHeader}>
            <View style={styles.rulesIconWrap}>
              <ShieldCheck size={18} color={examProcess.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rulesTitle}>Rules &amp; Regulations</Text>
              <Text style={styles.rulesSubtitle}>
                Proctoring Standards &amp; Examinee Guidelines
              </Text>
            </View>
          </View>

          <View style={styles.rulesList}>
            <RuleRow bold="Verification: " body="Examinees must join with the proctor QR code or room code on the same Join screen." />
            <RuleRow bold="Strict No-Device Policy: " body="Smartphones, smartwatches, and unauthorized electronics are prohibited." />
            <RuleRow bold="Duration & Timer: " body="Session is strictly timed; auto-submits when countdown reaches 00:00." />
            <RuleRow bold="No Skipping: " body="Unanswered questions are scored as 0. You may submit with unanswered items." />
            <RuleRow bold="Background / App Switch: " body="Leaving the exam app is detected and counted as a violation. Two violations trigger auto-submission." />
            <RuleRow bold="Screen Lockdown: " body="The exam runs in full-screen locked mode. Do not pull down notifications, swipe away, or switch apps." />
            {Platform.OS === 'ios' ? (
              <RuleRow bold="iOS Guided Access: " body="Triple-click the Side button to turn on Guided Access or enable Do Not Disturb so alerts and incoming calls do not trigger violations." />
            ) : null}
            <RuleRow bold="Disconnection: " body="A 2-minute grace period is provided to reconnect. Beyond that, the exam is auto-submitted." />
            <RuleRow bold="Passing Standard: " body="Minimum qualifying score is 75.0%." />
            <RuleRow bold="Results: " body="Official results will be sent to your registered Gmail after the session." />
          </View>
        </View>

        {/* Agreement Checkbox */}
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          {agreed ? (
            <CheckSquare size={22} color={examProcess.accent} />
          ) : (
            <Square size={22} color={examProcess.muted} />
          )}
          <Text style={styles.checkboxLabel}>
            I have read and agree to the examination rules and consequences above.
          </Text>
        </Pressable>

        <ExamProcessActions>
          <ExamProcessButton
            title="Proceed to Lobby"
            variant="submit"
            loading={proceeding}
            disabled={!agreed || proceeding}
            onPress={() => void handleProceed()}
          />
        </ExamProcessActions>
      </ScrollView>
    </ExamProcessChrome>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function RuleRow({ bold, body }: { bold: string; body: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleBullet}>•</Text>
      <Text style={styles.ruleText}>
        <Text style={styles.ruleBold}>{bold}</Text>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
    gap: 16,
  },
  metaCard: {
    backgroundColor: examProcess.cardBg,
    borderRadius: examProcess.radiusCard,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    padding: 16,
    gap: 12,
  },
  metaTitle: {
    fontSize: 16,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metaItem: {
    alignItems: 'center',
    gap: 2,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: examProcess.fontMedium,
    color: examProcess.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
  rulesSection: {
    backgroundColor: examProcess.cardBg,
    borderRadius: examProcess.radiusCard,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    padding: 16,
    gap: 14,
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rulesIconWrap: {
    width: 36,
    height: 36,
    borderRadius: examProcess.radiusControl,
    backgroundColor: examProcess.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesTitle: {
    fontSize: 14,
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
  rulesSubtitle: {
    fontSize: 12,
    fontFamily: examProcess.fontRegular,
    color: examProcess.muted,
  },
  rulesList: {
    gap: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ruleBullet: {
    fontSize: 14,
    color: examProcess.accent,
    fontFamily: examProcess.fontSemiBold,
    marginTop: 1,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: examProcess.ink,
    fontFamily: examProcess.fontRegular,
  },
  ruleBold: {
    fontFamily: examProcess.fontSemiBold,
    color: examProcess.ink,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: examProcess.ink,
    fontFamily: examProcess.fontMedium,
  },
});

