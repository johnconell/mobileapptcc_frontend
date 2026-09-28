import React, { useState } from 'react';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { ShieldCheck, CheckSquare, Square, AlertTriangle } from 'lucide-react-native';
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
 * This screen is reached AFTER the exam package has been downloaded in the
 * Confirm step. It is responsible for:
 *   1. Showing the exam rules and collecting agreement.
 *   2. Triggering Android App Pinning (kiosk mode) — must succeed before joining.
 *   3. Calling LobbyRepository.join* to register the student in the proctor's list.
 *   4. Navigating to lobby ONLY after all of the above succeed.
 *
 * The student is NOT counted as "inside the lobby" until step 3 completes.
 */
export default function TermsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const selectedStudent = useStudentStore((s) => s.selectedStudent);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const examPasskey = useStudentStore((s) => s.examPasskey);
  const setVerifiedStudent = useStudentStore((s) => s.setVerifiedStudent);
  const setAgreedAt = useStudentStore((s) => s.setAgreedAt);
  const lobbySnapshot = useLobbyStore((s) => s.snapshot);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);

  const [agreed, setAgreed] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [pinStatusText, setPinStatusText] = useState<string | null>(null);
  const [pinDeclined, setPinDeclined] = useState(false);

  // Block hardware back — student must proceed forward or stay here.
  React.useEffect(() => {
    navigation.setOptions({ gestureEnabled: false, headerShown: false });
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [navigation]);

  // Guard: must have a selected student + session to reach this screen.
  React.useEffect(() => {
    if ((!selectedStudent && !verifiedStudent) || !scannedSessionId) {
      router.replace('/(student)/passkey');
    }
  }, [selectedStudent, verifiedStudent, scannedSessionId, router]);

  // Derive exam metadata for display (from lobby snapshot if already available)
  const schedName = lobbySnapshot?.schedule?.name ?? 'Entrance Examination';
  const duration = lobbySnapshot?.session?.durationMinutes
    ? `${lobbySnapshot.session.durationMinutes} minutes`
    : '90 minutes';
  const batchLabel = lobbySnapshot?.session?.batchNumber ?? '—';
  const timeLabel = lobbySnapshot?.session?.timeLabel ?? '—';

  const handleProceed = async () => {
    if (!agreed || proceeding) return;
    setProceeding(true);
    setPinStatusText(null);
    setPinDeclined(false);

    // On Android: Gate entering the lobby behind mandatory App Pinning
    if (Platform.OS === 'android') {
      try {
        const { startExamLock, isExamLocked } = await import(
          '@/features/examinations/services/ExamSecurityService'
        );

        let locked = await isExamLocked();
        if (!locked) {
          setPinStatusText('Waiting for App Pinning confirmation...');
          await startExamLock();

          // Wait for student to tap "GOT IT" on the system dialog
          const start = Date.now();
          while (Date.now() - start < 7000) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            locked = await isExamLocked();
            if (locked) break;
          }

          if (!locked) {
            // Student tapped "No Thanks" — show inline blocking notice
            setProceeding(false);
            setPinStatusText(null);
            setPinDeclined(true);
            Alert.alert(
              'App Pinning Required',
              'Screen Pinning is required to proceed to the examination lobby. Please tap "GOT IT" on the system dialog to lock the application into kiosk mode.',
              [
                {
                  text: 'Try Again',
                  onPress: () => void handleProceed(),
                },
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
              ],
            );
            return;
          }
        }
      } catch (err) {
        console.warn('[TERMS] Pinning gate check error:', err);
      }
    }

    // Now register the student in the proctor's lobby list
    setPinStatusText('Registering with examination lobby...');
    try {
      const { LobbyRepository } = await import('@/features/lobby/repositories/LobbyRepository');
      const { appStorage } = await import('@/shared/services/storage');
      const { ExamLifecycle } = await import('@/features/examinations/services/examLifecycle');

      const effectivePasskey =
        examPasskey || (await appStorage.getItem('tcc.student.exam.passkey')) || '';

      // Use verifiedStudent if already set (resume path), otherwise selectedStudent (first time)
      const studentForJoin = verifiedStudent ?? selectedStudent!;

      const lobby = effectivePasskey
        ? await LobbyRepository.joinWithPasskey(studentForJoin, scannedSessionId!, effectivePasskey)
        : await LobbyRepository.joinStudent(studentForJoin, scannedSessionId!);

      const regId = lobby.registration_id;
      const updatedVerified = { ...studentForJoin };
      if (regId) {
        updatedVerified.registration_id = Number(regId);
      } else {
        const match = lobby.students?.find((s) => s.studentId === updatedVerified.studentId);
        if (match) updatedVerified.registration_id = Number(match.id);
      }
      setVerifiedStudent(updatedVerified);
      setSnapshot(lobby);
      await ExamLifecycle.applyFromServer(lobby.status, { sessionId: String(scannedSessionId) });

      const ts = new Date().toISOString();
      setAgreedAt(ts);

      // Record agreement on server (fire-and-forget)
      try {
        void LobbyRepository.recordAgreement();
      } catch {
        /* ignore */
      }

      setProceeding(false);
      setPinStatusText(null);
      router.replace('/(student)/lobby');
    } catch (err) {
      setProceeding(false);
      setPinStatusText(null);
      const { userFacingError } = await import('@/shared/utils/userFacingError');
      Alert.alert(
        'Unable to Enter Lobby',
        userFacingError(err, 'Could not connect to the examination lobby. Please verify your connection and try again.'),
      );
    }
  };

  return (
    <ExamProcessChrome
      step={2}
      title="Terms & Agreement"
      stepLabel="Step 3 of 6 · Confirm"
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
            {Platform.OS === 'android' ? (
              <RuleRow bold="Mandatory App Pinning: " body="Screen Pinning (App Pinning) is strictly required before entering the lobby. You must tap 'GOT IT' on the system prompt to lock into kiosk mode." />
            ) : (
              <RuleRow bold="Mandatory Guided Access: " body="Guided Access is strictly required on iPhone/iPad. Triple-click the Side button, select Guided Access, and start it before entering the examination." />
            )}
            <RuleRow bold="Unauthorized Electronics: " body="Secondary phones, smartwatches, and external electronic aids are strictly prohibited." />
            <RuleRow bold="Duration & Timer: " body="Session is strictly timed; auto-submits when countdown reaches 00:00." />
            <RuleRow bold="No Skipping: " body="Unanswered questions are scored as 0. You may submit with unanswered items." />
            <RuleRow bold="Screen Lockdown: " body="The exam runs in full-screen locked mode. Do not pull down notifications, swipe away, or switch apps." />
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
            {Platform.OS === 'ios'
              ? 'I have read, understand, and agree to the mandatory Guided Access requirement and examination rules above.'
              : 'I have read, understand, and agree to the mandatory App Pinning requirement and examination rules above.'}
          </Text>
        </Pressable>

        {/* Pin Declined — inline blocking notice */}
        {pinDeclined ? (
          <View style={styles.pinDeclinedBanner}>
            <AlertTriangle size={18} color="#b45309" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pinDeclinedTitle}>App Pinning Required</Text>
              <Text style={styles.pinDeclinedBody}>
                You tapped &ldquo;No Thanks&rdquo; on the App Pinning prompt. Screen Pinning
                is mandatory to enter the examination lobby. Tap the button
                below and then tap{' '}
                <Text style={styles.pinDeclinedEmphasis}>&ldquo;Got It&rdquo;</Text> on the
                system dialog to continue.
              </Text>
            </View>
          </View>
        ) : pinStatusText ? (
          <Text style={styles.pinStatusHint}>{pinStatusText}</Text>
        ) : null}

        <ExamProcessActions>
          <ExamProcessButton
            title={
              proceeding
                ? (pinStatusText || 'Entering Lobby...')
                : pinDeclined
                ? 'Try Again — Enable App Pinning'
                : 'Got It'
            }
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
  pinStatusHint: {
    fontSize: 13,
    fontFamily: examProcess.fontMedium,
    color: examProcess.accent,
    textAlign: 'center',
    marginVertical: 6,
  },
  pinDeclinedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: examProcess.radiusCard,
    padding: 14,
  },
  pinDeclinedTitle: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
    color: '#92400e',
    marginBottom: 4,
  },
  pinDeclinedBody: {
    fontSize: 13,
    fontFamily: examProcess.fontRegular,
    color: '#92400e',
    lineHeight: 20,
  },
  pinDeclinedEmphasis: {
    fontFamily: examProcess.fontSemiBold,
    color: '#78350f',
  },
});
