import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check } from 'lucide-react-native';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
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
import {
  examineeRedesignLayout,
  type ExamineeRedesignTheme,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';
import { userFacingError } from '@/shared/utils/userFacingError';
import { PracticeModeChip } from '@/features/practice/components/PracticeModeChip';
import { usePracticeStore } from '@/features/practice/practiceStore';
import { usePracticeTutorialTarget } from '@/features/practice/components/PracticeTutorialProvider';

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
  if (!raw) return 'To be announced';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const parsed = dateOnly
    ? new Date(dateOnly[1] + '-' + dateOnly[2] + '-' + dateOnly[3] + 'T12:00:00+08:00')
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
  return displayHour + ':' + String(minute).padStart(2, '0') + ' ' + suffix;
}

function formatManilaTimeRange(value: string): string {
  const raw = value.trim();
  if (!raw) return 'To be announced';
  const parts = raw.split(/\s*(?:-|–|—|to)\s*/i);
  return parts.length === 2
    ? formatManilaTime(parts[0]) + ' - ' + formatManilaTime(parts[1])
    : formatManilaTime(raw);
}

export function StudentConfirmationScreen({ practiceMode = false }: { practiceMode?: boolean }) {
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
  const practiceAgreed = usePracticeStore((s) => s.agreed);
  const setPracticeAgreed = usePracticeStore((s) => s.setAgreed);
  const agreeTutorial = usePracticeTutorialTarget('tutorial-agree');
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] =
    React.useState<ExamPackProgress>(INITIAL_PACK_PROGRESS);
  const proceedAfterIdentityRef = React.useRef(false);
  const [agreed, setAgreed] = React.useState(false);
  const isAgreed = practiceMode ? practiceAgreed : agreed;
  const [scheduleMeta, setScheduleMeta] = React.useState<StudentScheduleMeta>({
    scheduleTitle: params.scheduleTitle || 'Entrance Examination',
    examDate: params.examDate || '',
    timeSlot: params.timeSlot || '',
  });

  React.useEffect(() => {
    if (practiceMode) {
      setScheduleMeta({
        scheduleTitle: 'Practice Examination',
        examDate: '2026-11-20',
        timeSlot: '08:00 AM - 09:30 AM',
      });
      return;
    }
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
  }, [params.scheduleTitle, params.examDate, params.timeSlot, practiceMode]);

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
    if (practiceMode) return;
    if (verifiedStudent && scannedSessionId) {
      if (agreedAt) {
        router.replace('/(student)/lobby');
      }
      return;
    }
    if (!selectedStudent || !scannedSessionId) {
      router.replace('/(student)/passkey');
    }
  }, [selectedStudent, scannedSessionId, verifiedStudent, agreedAt, router, practiceMode]);

  const goBack = React.useCallback(() => {
    setSelectedStudent(null);
    setVerifiedStudent(null);
    setAgreedAt(null);
    router.replace(practiceMode ? '/practice/passkey' as any : '/(student)/passkey');
  }, [router, setSelectedStudent, setVerifiedStudent, setAgreedAt, practiceMode]);

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
        setJoinError(gate.message ?? 'Campus Wi-Fi required to join.');
        return;
      }

      setStatusMessage('Receiving questions from the examination room...');
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

  React.useEffect(() => {
    if (!proceedAfterIdentityRef.current || !verifiedStudent || !agreed || joining) return;
    proceedAfterIdentityRef.current = false;
    void handleProceed();
  }, [verifiedStudent, agreed, joining, handleProceed]);

  const onConfirmWithForm = handleSubmit(async (values) => {
    await confirmIdentity(values.email);
  });

  const onConfirmExisting = async () => {
    if (selectedStudent) await confirmIdentity(selectedStudent.email);
  };

  const theme = useExamineeRedesignTheme();

  if (!selectedStudent || !scannedSessionId) {
    return (
      <ExamineeRedesignChrome step={2} title="Is this you?" stepLabel="Step 3 of 6 · Confirm">
        <Text style={[styles.hint, { color: theme.secondaryText }]}>Loading...</Text>
      </ExamineeRedesignChrome>
    );
  }

  const formattedDate = formatManilaExamDate(scheduleMeta.examDate);
  const formattedTime = formatManilaTimeRange(scheduleMeta.timeSlot);
  const roomValue =
    scheduleMeta.scheduleTitle.trim() && scheduleMeta.scheduleTitle.trim() !== 'Entrance Examination'
      ? scheduleMeta.scheduleTitle.trim()
      : 'To be announced';
  const timeRoomValue =
    formattedTime === 'To be announced' || roomValue === 'To be announced'
      ? 'To be announced'
      : formattedTime + ' · ' + roomValue;
  const emailValue = hasGmail ? selectedStudent.email : 'To be announced';
  const submitDisabled = !isAgreed || joining || isSubmitting;

  const handleAgreementPress = () => {
    if (practiceMode) {
      router.replace('/practice/lobby' as any);
      return;
    }
    if (verifiedStudent) {
      void handleProceed();
      return;
    }
    proceedAfterIdentityRef.current = true;
    void onConfirmExisting();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamineeRedesignChrome
        step={2}
        title="Is this you?"
        stepLabel="Step 3 of 6 · Confirm"
        onBack={goBack}
        footer={
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Not me"
              disabled={joining || isSubmitting}
              onPress={goBack}
              style={[
                styles.secondaryButton,
                { backgroundColor: theme.secondaryCard },
                (joining || isSubmitting) && styles.disabledButton,
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Not me</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agree and continue"
              disabled={submitDisabled}
              onPress={handleAgreementPress}
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary },
                submitDisabled && styles.disabledButton,
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: theme.white }]}>
                {joining ? statusMessage || 'Please wait...' : 'Agree & Continue'}
              </Text>
            </Pressable>
          </View>
        }
      >
        {practiceMode ? <PracticeModeChip /> : null}
        <Text style={[styles.intro, { color: theme.secondaryText }]}>
          Confirm your registration details before you continue.
        </Text>

        <View style={[styles.identityCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <IdentityRow label="Name" value={selectedStudent.fullName} theme={theme} />
          <IdentityRow label="Program" value={selectedStudent.programName} theme={theme} />
          <IdentityRow label="Gmail" value={emailValue} theme={theme} />
          <IdentityRow label="Date" value={formattedDate} theme={theme} />
          <IdentityRow label="Time · Room" value={timeRoomValue} theme={theme} last />
        </View>

        <Text style={[styles.lockedNote, { color: theme.secondaryText }]}>
          Details are locked from your registration. Wrong info? Tell the proctor.
        </Text>

        <AgreementContent
          agreed={isAgreed}
          proceeding={joining}
          pinStatusText={statusMessage}
          progress={downloadProgress}
          onToggle={() => {
            const toggle = () => {
              if (practiceMode) setPracticeAgreed(!practiceAgreed);
              else setAgreed((value) => !value);
            };
            if (practiceMode) agreeTutorial.run(toggle);
            else toggle();
          }}
          agreementRef={practiceMode ? agreeTutorial.ref : undefined}
          joinError={joinError}
          theme={theme}
        />
      </ExamineeRedesignChrome>
    </KeyboardAvoidingView>
  );
}

export default function StudentConfirmationScreenRoute() {
  return <StudentConfirmationScreen />;
}

function IdentityRow({
  label,
  value,
  last = false,
  theme,
}: {
  label: string;
  value: string;
  last?: boolean;
  theme: ExamineeRedesignTheme;
}) {
  return (
    <View style={[styles.identityRow, !last && { borderBottomColor: theme.cardBorder, borderBottomWidth: 1 }]}>
      <Text style={[styles.identityLabel, { color: theme.secondaryText }]}>{label}</Text>
      <Text style={[styles.identityValue, { color: theme.text }]}>{value || 'To be announced'}</Text>
    </View>
  );
}

function AgreementContent({
  agreed,
  proceeding,
  pinStatusText,
  progress,
  joinError,
  onToggle,
  agreementRef,
  theme,
}: {
  agreed: boolean;
  proceeding: boolean;
  pinStatusText: string | null;
  progress: ExamPackProgress;
  joinError: string | null;
  onToggle: () => void;
  agreementRef?: React.Ref<View>;
  theme: ExamineeRedesignTheme;
}) {
  return (
    <>
      <View style={[styles.rulesCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.rulesTitle, { color: theme.text }]}>Exam rules</Text>
        <View style={styles.rulesList}>
          <RuleLine text="Your screen will be pinned. Do not switch apps." theme={theme} />
          <RuleLine text="No second phones or smartwatches." theme={theme} />
          <RuleLine text="The timer auto-submits at 00:00." theme={theme} />
          <RuleLine text="Results are sent to your Gmail." theme={theme} />
        </View>
        <Pressable
          testID={agreementRef ? 'tutorial-agree' : undefined}
          ref={agreementRef}
          style={styles.checkboxRow}
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: agreed ? theme.primary : 'transparent',
                borderColor: agreed ? theme.primary : theme.cardBorder,
              },
            ]}
          >
            {agreed ? <Check size={16} color={theme.white} strokeWidth={3} /> : null}
          </View>
          <Text style={[styles.checkboxLabel, { color: theme.text }]}>I understand and agree</Text>
        </Pressable>
      </View>

      {pinStatusText ? (
        <View style={[styles.statusCard, { backgroundColor: theme.successBackground, borderColor: theme.cardBorder }]}>
          <Text style={[styles.statusText, { color: theme.successText }]}>
            {progress.percent > 0
              ? pinStatusText + '\n' + progress.phaseLabel
              : pinStatusText}
          </Text>
        </View>
      ) : null}
      {joinError ? <Text style={[styles.error, { color: theme.error }]}>{joinError}</Text> : null}
    </>
  );
}

function RuleLine({ text, theme }: { text: string; theme: ExamineeRedesignTheme }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleBullet, { color: theme.secondaryText }]}>•</Text>
      <Text style={[styles.ruleText, { color: theme.secondaryText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  intro: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
  },
  identityCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    paddingHorizontal: examineeRedesignLayout.cardPadding,
  },
  identityRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  identityLabel: {
    width: 86,
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  identityValue: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  lockedNote: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    paddingHorizontal: 6,
  },
  rulesCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 16,
  },
  rulesTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Poppins_600SemiBold',
  },
  rulesList: {
    gap: 10,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  ruleBullet: {
    width: 14,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Poppins_600SemiBold',
  },
  ruleText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
  },
  checkboxRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 3,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Poppins_600SemiBold',
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Poppins_500Medium',
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Poppins_500Medium',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: examineeRedesignLayout.gap,
  },
  secondaryButton: {
    flex: 0.9,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1.8,
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
// End of confirmation screen styles.
