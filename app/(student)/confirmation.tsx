import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

export default function StudentConfirmationScreen() {
  const router = useRouter();
  const selectedStudent = useStudentStore((s) => s.selectedStudent);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const examPasskey = useStudentStore((s) => s.examPasskey);
  const setVerifiedStudent = useStudentStore((s) => s.setVerifiedStudent);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] =
    React.useState<ExamPackProgress>(INITIAL_PACK_PROGRESS);

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
      router.replace('/(student)/lobby');
      return;
    }
    if (!selectedStudent || !scannedSessionId) {
      router.replace('/(student)/passkey');
    }
  }, [selectedStudent, scannedSessionId, verifiedStudent, router]);

  const goBack = React.useCallback(() => {
    setSelectedStudent(null);
    router.replace('/(student)/passkey');
  }, [router, setSelectedStudent]);

  if (!selectedStudent || !scannedSessionId) {
    return (
      <ExamProcessChrome step={2} title="Confirm Identity" stepLabel="Step 3 of 6 · Confirm">
        <Text style={styles.hint}>Loading…</Text>
      </ExamProcessChrome>
    );
  }

  const joinWithEmail = async (email: string) => {
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
      } catch (err) {
        setJoinError(
          err instanceof Error
            ? err.message
            : 'Could not download examination package. Connect to the official examination Wi-Fi and try again.',
        );
        return;
      }

      setStatusMessage('Registering ready status with proctor...');
      const verified = {
        ...selectedStudent,
        email: email.trim().toLowerCase(),
      };

      const lobby = effectivePasskey
        ? await LobbyRepository.joinWithPasskey(verified, scannedSessionId, effectivePasskey)
        : await LobbyRepository.joinStudent(verified, scannedSessionId);

      const regId = lobby.registration_id;
      if (regId) {
        verified.registration_id = Number(regId);
      } else {
        const match = lobby.students?.find((s) => s.studentId === verified.studentId);
        if (match) verified.registration_id = Number(match.id);
      }
      setVerifiedStudent(verified);
      setSnapshot(lobby);
      await ExamLifecycle.applyFromServer(lobby.status, { sessionId: String(scannedSessionId) });
      router.replace('/(student)/lobby');
    } catch (error) {
      setJoinError(userFacingError(error, 'Unable to join examination. Please try again.'));
    } finally {
      setJoining(false);
      setStatusMessage(null);
    }
  };

  const onConfirmWithForm = handleSubmit(async (values) => {
    await joinWithEmail(values.email);
  });

  const onConfirmExisting = async () => {
    await joinWithEmail(selectedStudent.email);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamProcessChrome
        step={2}
        title="Confirm Identity"
        stepLabel="Step 3 of 6 · Confirm"
        onBack={goBack}
      >
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
          {downloadProgress.percent > 0
            ? `${statusMessage}\n${downloadProgress.phaseLabel}`
            : statusMessage}
        </ExamProcessOk>

        {joinError ? <Text style={styles.error}>{joinError}</Text> : null}

        <ExamProcessActions>
          <ExamProcessButton
            title="Back"
            variant="back"
            onPress={goBack}
            disabled={joining || isSubmitting}
          />
          <ExamProcessButton
            title="Confirm & Join"
            variant="submit"
            loading={joining || isSubmitting}
            onPress={hasGmail ? onConfirmExisting : onConfirmWithForm}
          />
        </ExamProcessActions>
      </ExamProcessChrome>
    </KeyboardAvoidingView>
  );
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
});
