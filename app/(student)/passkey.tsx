import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AlertCircle, Mail } from 'lucide-react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ExamineeRedesignChrome } from '@/features/examinations/components/ExamineeRedesignChrome';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { appStorage } from '@/shared/services/storage';
import {
  examineeRedesignLayout,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';
import { userFacingError } from '@/shared/utils/userFacingError';
import { formatPasskey, isValidPasskey, normalizePasskey } from '@/features/examinations/services/passkeyFormat';
import { PracticeModeChip } from '@/features/practice/components/PracticeModeChip';
import { DEMO_PASSKEY, MOCK_APPLICANT, usePracticeStore } from '@/features/practice/practiceStore';
import type { StudentRecord } from '@/shared/types';
import { usePracticeTutorialTarget } from '@/features/practice/components/PracticeTutorialProvider';

const schema = z.object({
  passkey: z
    .string()
    .trim()
    .refine(isValidPasskey, 'Use the 8-letter or number examination key'),
});

type FormValues = z.infer<typeof schema>;

export function StudentPasskeyScreen({ practiceMode = false }: { practiceMode?: boolean }) {
  const router = useRouter();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const agreedAt = useStudentStore((s) => s.agreedAt);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);
  const setExamPasskey = useStudentStore((s) => s.setExamPasskey);
  const setPracticePasskey = usePracticeStore((s) => s.setPasskey);
  const keyChipTutorial = usePracticeTutorialTarget('tutorial-key-chip');
  const storedPracticePasskey = usePracticeStore((s) => s.passkey);
  const [error, setError] = useState<string | null>(null);

  const storedPasskey = useStudentStore((s) => s.examPasskey);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { passkey: storedPasskey || (practiceMode ? storedPracticePasskey || DEMO_PASSKEY : '') },
  });

  React.useEffect(() => {
    if (storedPasskey) {
      setValue('passkey', storedPasskey);
    }
  }, [storedPasskey, setValue]);

  React.useEffect(() => {
    if (practiceMode) return;
    if (!scannedSessionId) {
      router.replace('/');
    }
  }, [scannedSessionId, router, practiceMode]);

  React.useEffect(() => {
    if (practiceMode) return;
    if (verifiedStudent && scannedSessionId) {
      const nextRoute = agreedAt ? '/(student)/lobby' : '/(student)/confirmation';
      router.replace(nextRoute as any);
    }
  }, [verifiedStudent, scannedSessionId, agreedAt, router, practiceMode]);

  const theme = useExamineeRedesignTheme();

  if (!scannedSessionId) {
    return (
      <ExamineeRedesignChrome step={1} title="Examination Key" stepLabel="Step 2 of 6 · Key">
        <Text style={[styles.hint, { color: theme.secondaryText }]}>Loading session…</Text>
      </ExamineeRedesignChrome>
    );
  }

  const onContinue = handleSubmit(async (values) => {
    setError(null);
    if (practiceMode) {
      const key = formatPasskey(values.passkey);
      setPracticePasskey(key);
      setExamPasskey(key);
      setSelectedStudent({
        id: MOCK_APPLICANT.id,
        studentId: MOCK_APPLICANT.studentId,
        firstName: 'Juan',
        middleName: '',
        lastName: 'Dela Cruz',
        fullName: MOCK_APPLICANT.fullName,
        email: MOCK_APPLICANT.email,
        programId: 'practice-program',
        programCode: 'PRACTICE',
        programName: MOCK_APPLICANT.programName,
        sex: 'Male',
        avatarInitials: 'JD',
      } as StudentRecord);
      router.push('/practice/confirmation' as any);
      return;
    }
    try {
      const result = await LobbyRepository.validatePasskey(normalizePasskey(values.passkey));
      if (result.classification === 'already_completed') {
        setError(
          result.message ||
            'Examination Already Completed\nYou have already taken this examination. Multiple attempts are not permitted.',
        );
        return;
      }
      if (result.classification === 'already_in_lobby') {
        setError(
          result.message ||
            'Someone is already inside the lobby with this examination key. Please check your key or contact your proctor.',
        );
        return;
      }
      if (result.classification === 'wrong_schedule') {
        const sched = result.schedule;
        if (sched && (sched.exam_date || sched.time_slot || sched.title)) {
          const parts = [] as string[];
          if (sched.title) parts.push(sched.title);
          if (sched.exam_date) parts.push(sched.exam_date);
          if (sched.time_slot) parts.push(sched.time_slot);
          setError(
            `${result.message || 'This examination key belongs to another schedule.'}\nScheduled: ${parts.join(' · ')}`,
          );
        } else {
          setError(result.message || 'This examination key belongs to a different schedule.');
        }
        return;
      }
      const upperKey = formatPasskey(values.passkey);
      if (!result.student) {
        throw new Error(result.message || 'Unable to continue with this examination key.');
      }

      const applicantCode = String(result.student.studentId || result.student.id || '')
        .trim()
        .toUpperCase();
      const scheduleId = result.schedule?.id ? Number(result.schedule.id) : null;

      if (applicantCode && scheduleId) {
        const localMarker = await appStorage.getItem(
          `tcc.student.completed.${scheduleId}.${applicantCode}`,
        );
        if (localMarker === '1') {
          setError(
            'Examination Already Completed\nYou have already taken this examination on this device. Multiple attempts are not permitted.',
          );
          return;
        }
      }

      const results = await OfflineStore.getResults();
      const already = results.find((r) => {
        const matchApplicant =
          (r.applicant_code || '').trim().toUpperCase() === applicantCode;
        const matchSchedule = scheduleId
          ? Number(r.examination_schedule_id) === scheduleId
          : false;
        return matchApplicant && matchSchedule;
      });
      if (already) {
        setError(
          'Examination Already Completed\nYou have already taken this examination. Multiple attempts are not permitted.',
        );
        return;
      }

      await appStorage.setItem('tcc.student.exam.passkey', upperKey);
      setExamPasskey(upperKey);
      setSelectedStudent(result.student);
      router.push({
        pathname: '/(student)/confirmation',
        params: {
          scheduleTitle: result.schedule?.title || '',
          examDate: result.schedule?.exam_date || '',
          timeSlot: result.schedule?.time_slot || '',
        },
      } as any);
    } catch (err) {
      setError(userFacingError(err, 'Unable to validate the examination key. Please try again.'));
    }
  });

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ExamineeRedesignChrome
        step={1}
        title="Examination Key"
        stepLabel="Step 2 of 6 · Key"
        onBack={() => router.replace(practiceMode ? '/practice/scan' as any : '/(student)/scan')}
        footer={
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.replace(practiceMode ? '/practice/scan' as any : '/(student)/scan')}
              style={[styles.secondaryButton, { backgroundColor: theme.secondaryCard }]}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Back</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next"
              disabled={isSubmitting}
              onPress={onContinue}
              style={[
                styles.primaryButton,
                { backgroundColor: theme.primary },
                isSubmitting && styles.buttonDisabled,
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: theme.white }]}>
                {isSubmitting ? 'Please wait…' : 'Next'}
              </Text>
            </Pressable>
          </View>
        }
      >
        {practiceMode ? <PracticeModeChip /> : null}
        <Text style={[styles.intro, { color: theme.secondaryText }]}>Type the unique key sent to your Gmail.</Text>
        <Controller
          control={control}
          name="passkey"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.cardBorder,
                  color: theme.text,
                },
                Boolean(errors.passkey || error) && { borderColor: theme.error },
              ]}
              placeholder="e.g. K7M2-P9QX"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              value={value}
              onChangeText={(text) => onChange(formatPasskey(text))}
              onBlur={onBlur}
              maxLength={9}
              onSubmitEditing={onContinue}
            />
          )}
        />
        {errors.passkey?.message ? <Text style={[styles.error, { color: theme.error }]}>{errors.passkey.message}</Text> : null}
        {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

        {practiceMode ? (
          <Pressable
            testID="tutorial-key-chip"
            ref={keyChipTutorial.ref}
            accessibilityRole="button"
            accessibilityLabel="Practice key DEMO-1234. Tap to fill."
            onPress={() => keyChipTutorial.run(() => setValue('passkey', DEMO_PASSKEY, { shouldValidate: true }))}
            style={[styles.demoKeyChip, { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder }]}
          >
            <Text style={[styles.demoKeyText, { color: theme.text }]}>Practice key · DEMO-1234 · Tap to fill</Text>
          </Pressable>
        ) : null}

        <View style={[styles.helpCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.helpRow}>
            <View style={[styles.helpIcon, { backgroundColor: theme.primarySoft }]}>
              <Mail size={22} color={theme.primary} />
            </View>
            <View style={styles.helpCopy}>
              <Text style={[styles.helpTitle, { color: theme.text }]}>Where is my key?</Text>
              <Text style={[styles.helpBody, { color: theme.secondaryText }]}>Open the email from TCC in your Gmail inbox.</Text>
            </View>
          </View>
          <View style={styles.helpRow}>
            <View style={[styles.helpIcon, { backgroundColor: theme.primarySoft }]}>
              <AlertCircle size={22} color={theme.primary} />
            </View>
            <View style={styles.helpCopy}>
              <Text style={[styles.helpTitle, { color: theme.text }]}>One key per student</Text>
              <Text style={[styles.helpBody, { color: theme.secondaryText }]}>Never use or share another student&apos;s key.</Text>
            </View>
          </View>
        </View>
      </ExamineeRedesignChrome>
    </KeyboardAvoidingView>
  );
}

export default function StudentPasskeyScreenRoute() {
  return <StudentPasskeyScreen />;
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
  input: {
    height: 68,
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    paddingHorizontal: 16,
    fontSize: 26,
    fontFamily: 'Poppins_600SemiBold',
    width: '100%',
    letterSpacing: 5,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    marginTop: -6,
    fontFamily: 'Poppins_500Medium',
    lineHeight: 18,
  },
  helpCard: {
    borderWidth: 1,
    borderRadius: examineeRedesignLayout.cardRadius,
    padding: examineeRedesignLayout.cardPadding,
    gap: 18,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  helpIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  helpTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontFamily: 'Poppins_600SemiBold',
  },
  helpBody: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
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
  buttonDisabled: {
    opacity: 0.55,
  },
  demoKeyChip: { alignSelf: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8 },
  demoKeyText: { fontSize: 12, fontWeight: '600' },
});
