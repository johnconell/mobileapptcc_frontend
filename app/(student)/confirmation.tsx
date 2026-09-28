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
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { ExamPreloader } from '@/features/examinations/services/examPreloader';
import {
  INITIAL_PACK_PROGRESS,
  type ExamPackProgress,
} from '@/features/examinations/services/examReadiness';
import { appStorage } from '@/shared/services/storage';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
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
  const agreedAt = useStudentStore((s) => s.agreedAt);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);

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

  // If the student already agreed to terms and is verified, they are already in the lobby flow.
  // Send them directly to lobby (resume from Terms was already completed).
  React.useEffect(() => {
    if (verifiedStudent && agreedAt) {
      router.replace('/(student)/lobby');
      return;
    }
    // If verified but hasn't agreed yet → send to terms to complete agreement + join
    if (verifiedStudent && !agreedAt) {
      router.replace('/(student)/terms' as any);
      return;
    }
    if (!selectedStudent || !scannedSessionId) {
      router.replace('/(student)/passkey');
    }
  }, [selectedStudent, scannedSessionId, verifiedStudent, agreedAt, router]);

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

  /**
   * Confirm step only does:
   *  1. Wi-Fi gate check
   *  2. Download + verify the exam package
   *  3. Store the email on selectedStudent (does NOT join the lobby)
   *  4. Navigate to Terms (which does app pinning + lobby join)
   */
  const confirmWithEmail = async (email: string) => {
    setJoinError(null);
    setJoining(true);
    try {
      setStatusMessage('Validating Wi-Fi connection...');
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

      // Persist the email into selectedStudent so Terms screen can pick it up
      setStatusMessage('Preparing examination profile...');
      useStudentStore.getState().setSelectedStudent({
        ...selectedStudent,
        email: email.trim().toLowerCase(),
      });

      // Navigate to Terms — that screen does the lobby join + app pinning
      router.replace('/(student)/terms' as any);
    } catch (error) {
      setJoinError(userFacingError(error, 'Unable to confirm. Please try again.'));
    } finally {
      setJoining(false);
      setStatusMessage(null);
    }
  };

  const onConfirmWithForm = handleSubmit(async (values) => {
    await confirmWithEmail(values.email);
  });

  const onConfirmExisting = async () => {
    await confirmWithEmail(selectedStudent.email);
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
            title="Confirm & Continue"
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
