import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, Header, Input, Loader } from '@/components/ui';
import { LobbyRepository, StudentRepository } from '@/repositories';
import { useLobbyStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

const confirmationSchema = z.object({
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

type ConfirmationValues = z.infer<typeof confirmationSchema>;

export default function StudentConfirmationScreen() {
  const router = useRouter();
  const selectedStudent = useStudentStore((s) => s.selectedStudent);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const setVerifiedStudent = useStudentStore((s) => s.setVerifiedStudent);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const [joinError, setJoinError] = React.useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmationValues>({
    resolver: zodResolver(confirmationSchema),
    defaultValues: { email: '' },
  });

  React.useEffect(() => {
    if (verifiedStudent && scannedSessionId) {
      router.replace('/(student)/lobby');
      return;
    }
    if (!selectedStudent || !scannedSessionId) {
      router.replace('/(student)/verify');
    }
  }, [selectedStudent, scannedSessionId, verifiedStudent, router]);

  const goBack = React.useCallback(() => {
    if (selectedStudent?.id) {
      void StudentRepository.releaseClaim(selectedStudent.id).catch(() => undefined);
    }
    router.back();
  }, [selectedStudent?.id, router]);

  if (!selectedStudent || !scannedSessionId) {
    return <Loader fullscreen label="Loading confirmation…" />;
  }

  const onConfirm = handleSubmit(async (values) => {
    setJoinError(null);
    try {
      const verified = {
        ...selectedStudent,
        email: values.email.trim().toLowerCase(),
      };
      setVerifiedStudent(verified);
      const lobby = await LobbyRepository.joinStudent(verified, scannedSessionId);
      setSnapshot(lobby);
      router.replace('/(student)/lobby');
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to join examination.');
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Confirm Identity"
        subtitle="Enter your Gmail for results"
        onBack={goBack}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={styles.intro}>
            Confirm that this is your record, then enter your Gmail address. Official examination
            results will be sent to this email.
          </Text>

          <ReadOnlyField label="Full Name" value={selectedStudent.fullName} />
          <ReadOnlyField label="Desired Program" value={selectedStudent.programName} />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Gmail Address"
                placeholder="yourname@gmail.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                hint="Required so your score can be emailed later"
              />
            )}
          />

          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}

          <View style={styles.actions}>
            <Button
              title="Back"
              variant="outline"
              style={styles.btn}
              onPress={goBack}
              disabled={isSubmitting}
            />
            <Button
              title="Confirm"
              style={styles.btn}
              loading={isSubmitting}
              onPress={onConfirm}
            />
          </View>
        </Card>
      </ScrollView>
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
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    marginBottom: 18,
  },
  field: { marginBottom: 14, gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  readonly: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  value: { fontSize: 15, fontWeight: '600', color: colors.ink },
  error: {
    marginTop: 8,
    fontSize: 13,
    color: '#B42318',
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1 },
});
