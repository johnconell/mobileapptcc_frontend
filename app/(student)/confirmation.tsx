import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckSquare, ShieldCheck, Square } from 'lucide-react-native';
import {
  ExamProcessActions,
  ExamProcessButton,
  ExamProcessChrome,
  ExamProcessOk,
} from '@/features/examinations/components/ExamProcessChrome';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
import {
  INITIAL_PACK_PROGRESS,
  type ExamPackProgress,
} from '@/features/examinations/services/examReadiness';
import { appStorage } from '@/shared/services/storage';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { examProcess } from '@/shared/theme/examProcess';
import { userFacingError } from '@/shared/utils/userFacingError';

const gmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Gmail address is required')
    .email('Enter a valid email address')
    .refine(
      (value) => value.toLowerCase().endsWith('@gmail.com'),
      'Use a Gmail address (example@gmail.com)',
    ),
});

type ConfirmationValues = z.infer<typeof gmailSchema>;

const STUDENT_SCHEDULE_KEY = 'tcc.student.exam.schedule';
type StudentScheduleMeta = { scheduleTitle: string; examDate: string; timeSlot: string };

function formatManilaExamDate(value: string): string {
  const raw = value.trim();
  if (!raw) return 'Schedule date unavailable';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const parsed = dateOnly
    ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00+08:00`)
    : new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

function formatManilaTime(value: string): string {
  const raw = value.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return raw;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatManilaTimeRange(value: string): string {
  const raw = value.trim();
  if (!raw) return 'Schedule time unavailable';
  const parts = raw.split(/\s*(?:-|–|—|to)\s*/i);
  return parts.length === 2
    ? `${formatManilaTime(parts[0])} - ${formatManilaTime(parts[1])}`
    : formatManilaTime(raw);
}

export default function StudentConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    scheduleTitle?: string;
    examDate?: string;
    timeSlot?: string;
  }>();
  const selectedStudent = useStudentStore((s) => s.selectedStudent);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const examPasskey = useStudentStore((s) => s.examPasskey);
  const agreedAt = useStudentStore((s) => s.agreedAt);
  const setVerifiedStudent = useStudentStore((s) => s.setVerifiedStudent);
  const setAgreedAt = useStudentStore((s) => s.setAgreedAt);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] =
    React.useState<ExamPackProgress>(INITIAL_PACK_PROGRESS);
  const [showAgreement, setShowAgreement] = React.useState(Boolean(verifiedStudent));
  const [agreed, setAgreed] = React.useState(false);
  const [scheduleMeta, setScheduleMeta] = React.useState<StudentScheduleMeta>({
    scheduleTitle: params.scheduleTitle || 'Entrance Examination',
    examDate: params.examDate || '',
    timeSlot: params.timeSlot || '',
  });

  React.useEffect(() => {
    void (async () => {
      const fromRoute: StudentScheduleMeta = {
        scheduleTitle: params.scheduleTitle || 'Entrance Examination',
        examDate: params.examDate || '',
        timeSlot: params.timeSlot || '',
      };
      if (fromRoute.examDate || fromRoute.timeSlot) {
        setScheduleMeta(fromRoute);
        await appStorage.setItem(STUDENT_SCHEDULE_KEY, JSON.stringify(fromRoute));
        return;
      }
      try {
        const stored = await appStorage.getItem(STUDENT_SCHEDULE_KEY);
        if (stored) setScheduleMeta(JSON.parse(stored) as StudentScheduleMeta);
      } catch {
        // Keep explicit unavailable labels; never invent a schedule.
      }
    })();
  }, [params.scheduleTitle, params.examDate, params.timeSlot]);

  const hasGmail = Boolean(selectedStudent?.email?.trim());

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmationValues>({
    resolver: zodResolver(gmailSchema),
    defaultValues: { email: selectedStudent?.email?.trim() || '' },
  });

  React.useEffect(() => ExamPreloader.subscribe(setDownloadProgress), []);

  React.useEffect(() => {
    if (verifiedStudent && scannedSessionId) {
      if (agreedAt) {
        router.replace('/(student)/lobby');
      } else setShowAgreement(true);
      return;
    }
    if (!selectedStudent || !scannedSessionId) {
      router.replace('/(student)/passkey');
    }
  }, [selectedStudent, scannedSessionId, verifiedStudent, agreedAt, router]);

  const goBack = React.useCallback(() => {
    setSelectedStudent(null);
    setVerifiedStudent(null);
    setAgreedAt(null);
    setShowAgreement(false);
    router.replace('/(student)/passkey');
  }, [router, setSelectedStudent, setVerifiedStudent, setAgreedAt]);

  const confirmIdentity = async (email: string) => {
    if (!selectedStudent) return;
    setJoinError(null);
    setJoining(true);
    try {
      setStatusMessage('Validating Wi-Fi isolation...');
      const gate = await assertCampusWifiForJoin({
        requireServer: !String(scannedSessionId).startsWith('offline-'),
      });
      if (!gate.ok) {
        setJoinError(gate.message ?? 'Campus Wi‑Fi required to join.');
        return;
      }

      setStatusMessage('Receiving questions from the examination room…');
      const effectivePasskey =
        examPasskey || (await appStorage.getItem('tcc.student.exam.passkey')) || '';

      try {
        await ExamPreloader.downloadAndVerifyExamPackage({
          sessionId: String(scannedSessionId),
          passkey: effectivePasskey,
        });
        const cachedSchedule = await ExamPreloader.getCachedScheduleMetadata();
        if (cachedSchedule) {
          const nextSchedule: StudentScheduleMeta = {
            scheduleTitle: cachedSchedule.title || scheduleMeta.scheduleTitle,
            examDate: cachedSchedule.examDate || scheduleMeta.examDate,
            timeSlot:
              cachedSchedule.timeSlot ||
              [cachedSchedule.startTime, cachedSchedule.endTime].filter(Boolean).join(' - ') ||
              scheduleMeta.timeSlot,
          };
          setScheduleMeta(nextSchedule);
          await appStorage.setItem(STUDENT_SCHEDULE_KEY, JSON.stringify(nextSchedule));
        }
      } catch (err) {
        setJoinError(userFacingError(
          err,
          'Unable to receive the examination pack from the proctor. Check the local Wi-Fi connection and try again.',
        ));
        return;
      }

      setStatusMessage('Preparing examination profile...');
      const verified = {
        ...selectedStudent,
        email: email.trim().toLowerCase(),
      };
      setVerifiedStudent(verified);
      setShowAgreement(true);
    } catch (error) {
      setJoinError(userFacingError(error, 'Unable to join examination. Please try again.'));
    } finally {
      setJoining(false);
      setStatusMessage(null);
    }
  };

  const handleProceed = async () => {
    if (!agreed || joining || !scannedSessionId || !verifiedStudent) return;
    setJoining(true);
    setJoinError(null);
    try {
      setStatusMessage('Registering with examination lobby...');
      const effectivePasskey =
        examPasskey || (await appStorage.getItem('tcc.student.exam.passkey')) || '';
      if (!effectivePasskey) {
        throw new Error('Examination passkey verification is required before joining.');
      }
      const lobby = await LobbyRepository.joinWithPasskey(
        verifiedStudent,
        scannedSessionId,
        effectivePasskey,
      );
      const updatedVerified = { ...verifiedStudent };
      const regId = lobby.registration_id || lobby.students?.find((s) => s.studentId === updatedVerified.studentId)?.id;
      if (regId) updatedVerified.registration_id = Number(regId);
      setVerifiedStudent(updatedVerified);
      setSnapshot(lobby);
      await ExamLifecycle.applyFromServer(lobby.status, { sessionId: String(scannedSessionId) });
      setAgreedAt(new Date().toISOString());
      void LobbyRepository.recordAgreement();
      router.replace('/(student)/lobby');
    } catch (error) {
      setJoinError(userFacingError(error, 'Unable to enter the examination lobby. Please try again.'));
    } finally {
      setJoining(false);
      setStatusMessage(null);
    }
  };

  const onConfirmWithForm = handleSubmit(async (values) => {
    await confirmIdentity(values.email);
  });

  const onConfirmExisting = async () => {
    if (selectedStudent) await confirmIdentity(selectedStudent.email);
  };

  if (!selectedStudent || !scannedSessionId) {
    return (
      <ExamProcessChrome step={2} title="Confirm Identity" stepLabel="Step 3 of 6 · Confirm">
        <Text style={styles.hint}>Loading…</Text>
      </ExamProcessChrome>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamProcessChrome step={2} title="Confirm Identity" stepLabel="Step 3 of 6 · Confirm" onBack={goBack}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {!showAgreement ? (
            <>
              <Text style={styles.intro}>
                {hasGmail
                  ? 'Confirm that this is your record. Your examination key matched this registration.'
                  : 'Confirm that this is your record, then enter your Gmail address for results.'}
              </Text>

        <ReadOnlyField label="Full Name" value={selectedStudent.fullName} />
        <ReadOnlyField label="Desired Program" value={selectedStudent.programName} />
        {hasGmail ? (
          <ReadOnlyField label="Gmail" value={selectedStudent.email} />
        ) : (
          <View style={styles.field}>
            <Text style={styles.label}>Gmail Address</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, Boolean(errors.email) && styles.inputInvalid]}
                  placeholder="yourname@gmail.com"
                  placeholderTextColor={examProcess.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />
            {errors.email?.message ? (
              <Text style={styles.error}>{errors.email.message}</Text>
            ) : (
              <Text style={styles.hint}>Required so your score can be emailed later</Text>
            )}
          </View>
        )}

              <ExamProcessOk visible={Boolean(statusMessage && joining)}>
                {downloadProgress.percent > 0 ? `${statusMessage}\n${downloadProgress.phaseLabel}` : statusMessage}
              </ExamProcessOk>

            {joinError ? <Text style={styles.error}>{joinError}</Text> : null}

              <ExamProcessActions>
                <ExamProcessButton title="Back" variant="back" onPress={goBack} disabled={joining || isSubmitting} />
                <ExamProcessButton title="Continue" variant="submit" loading={joining || isSubmitting} onPress={hasGmail ? onConfirmExisting : onConfirmWithForm} />
              </ExamProcessActions>
            </>
          ) : (
            <AgreementContent
              scheduleTitle={scheduleMeta.scheduleTitle}
              examDate={formatManilaExamDate(scheduleMeta.examDate)}
              timeSlot={formatManilaTimeRange(scheduleMeta.timeSlot)}
              agreed={agreed}
              proceeding={joining}
              pinStatusText={statusMessage}
              onToggle={() => setAgreed((value) => !value)}
              onProceed={() => void handleProceed()}
              joinError={joinError}
            />
          )}
        </ScrollView>
      </ExamProcessChrome>
    </KeyboardAvoidingView>
  );
}

function AgreementContent({
  scheduleTitle,
  examDate,
  timeSlot,
  agreed,
  proceeding,
  pinStatusText,
  joinError,
  onToggle,
  onProceed,
}: {
  scheduleTitle: string;
  examDate: string;
  timeSlot: string;
  agreed: boolean;
  proceeding: boolean;
  pinStatusText: string | null;
  joinError: string | null;
  onToggle: () => void;
  onProceed: () => void;
}) {
  return (
    <>
      <View style={styles.metaCard}>
        <Text style={styles.metaTitle}>{scheduleTitle}</Text>
        <View style={styles.metaRow}>
          <MetaItem label="Date" value={examDate} />
          <MetaItem label="Time" value={timeSlot} />
        </View>
      </View>
      <View style={styles.rulesSection}>
        <View style={styles.rulesHeader}>
          <View style={styles.rulesIconWrap}><ShieldCheck size={18} color={examProcess.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rulesTitle}>Terms &amp; Agreement</Text>
            <Text style={styles.rulesSubtitle}>Proctoring Standards &amp; Examinee Guidelines</Text>
          </View>
        </View>
        <View style={styles.rulesList}>
          <RuleRow bold="Verification: " body="Examinees must join with the proctor QR code or room code on the same Join screen." />
          <RuleRow bold={Platform.OS === 'android' ? 'Mandatory App Pinning: ' : 'Mandatory Guided Access: '} body={Platform.OS === 'android' ? "Screen Pinning is required before the examination starts, after the proctor approves your request." : 'Guided Access is required on iPhone/iPad before the examination starts, after proctor approval.'} />
          <RuleRow bold="Unauthorized Electronics: " body="Secondary phones, smartwatches, and external electronic aids are strictly prohibited." />
          <RuleRow bold="Duration & Timer: " body="Session is strictly timed; auto-submits when countdown reaches 00:00." />
          <RuleRow bold="Screen Lockdown: " body="The exam runs in full-screen locked mode. Do not switch apps during the examination." />
          <RuleRow bold="Results: " body="Official results will be sent to your registered Gmail after the session." />
        </View>
      </View>
      <Pressable style={styles.checkboxRow} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
        {agreed ? <CheckSquare size={22} color={examProcess.accent} /> : <Square size={22} color={examProcess.muted} />}
        <Text style={styles.checkboxLabel}>I have read, understand, and agree to the examination rules and security requirements above.</Text>
      </Pressable>
      {pinStatusText ? <Text style={styles.pinStatusHint}>{pinStatusText}</Text> : null}
      {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
      <ExamProcessActions>
        <ExamProcessButton title={proceeding ? pinStatusText || 'Entering Lobby...' : 'Got It'} variant="submit" loading={proceeding} disabled={!agreed || proceeding} onPress={onProceed} />
      </ExamProcessActions>
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.metaItem}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>;
}

function RuleRow({ bold, body }: { bold: string; body: string }) {
  return <View style={styles.ruleRow}><Text style={styles.ruleBullet}>•</Text><Text style={styles.ruleText}><Text style={styles.ruleBold}>{bold}</Text>{body}</Text></View>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: examProcess.pageBg },
  scrollContent: { paddingBottom: 28, gap: 16 },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: examProcess.muted,
    marginBottom: 14,
    fontFamily: examProcess.fontRegular,
  },
  field: { marginBottom: 12, gap: 6 },
  label: {
    fontSize: 14,
    fontFamily: examProcess.fontMedium,
    color: examProcess.ink,
  },
  readonly: {
    minHeight: 48,
    borderRadius: examProcess.radiusControl,
    borderWidth: 1,
    borderColor: examProcess.inputBorder,
    backgroundColor: examProcess.inputBg,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  value: {
    fontSize: 15,
    fontFamily: examProcess.fontMedium,
    color: examProcess.ink,
  },
  input: {
    backgroundColor: examProcess.inputBg,
    borderWidth: 1,
    borderColor: examProcess.inputBorder,
    borderRadius: examProcess.radiusControl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: examProcess.fontRegular,
    color: examProcess.ink,
    width: '100%',
  },
  inputInvalid: { borderColor: examProcess.error },
  error: {
    marginTop: 6,
    fontSize: 13,
    color: examProcess.error,
    fontFamily: examProcess.fontMedium,
  },
  hint: {
    fontSize: 13,
    color: examProcess.muted,
    fontFamily: examProcess.fontRegular,
  },
  metaCard: { backgroundColor: examProcess.cardBg, borderRadius: examProcess.radiusCard, borderWidth: 1, borderColor: examProcess.cardBorder, padding: 16, gap: 12 },
  metaTitle: { fontSize: 16, fontFamily: examProcess.fontSemiBold, color: examProcess.ink, textAlign: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-around' },
  metaItem: { alignItems: 'center', gap: 2 },
  metaLabel: { fontSize: 10, fontFamily: examProcess.fontMedium, color: examProcess.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontFamily: examProcess.fontSemiBold, color: examProcess.ink },
  rulesSection: { backgroundColor: examProcess.cardBg, borderRadius: examProcess.radiusCard, borderWidth: 1, borderColor: examProcess.cardBorder, padding: 16, gap: 14 },
  rulesHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rulesIconWrap: { width: 36, height: 36, borderRadius: examProcess.radiusControl, backgroundColor: examProcess.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rulesTitle: { fontSize: 14, fontFamily: examProcess.fontSemiBold, color: examProcess.ink },
  rulesSubtitle: { fontSize: 12, fontFamily: examProcess.fontRegular, color: examProcess.muted },
  rulesList: { gap: 10 },
  ruleRow: { flexDirection: 'row', gap: 8 },
  ruleBullet: { fontSize: 14, color: examProcess.accent, fontFamily: examProcess.fontSemiBold, marginTop: 1 },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 20, color: examProcess.ink, fontFamily: examProcess.fontRegular },
  ruleBold: { fontFamily: examProcess.fontSemiBold, color: examProcess.ink },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  checkboxLabel: { flex: 1, fontSize: 14, lineHeight: 22, color: examProcess.ink, fontFamily: examProcess.fontMedium },
  pinStatusHint: { fontSize: 13, fontFamily: examProcess.fontMedium, color: examProcess.accent, textAlign: 'center', marginVertical: 6 },
});
