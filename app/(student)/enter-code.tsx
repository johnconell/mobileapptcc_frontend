import React, { useState } from 'react';
import { Text, View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react-native';
import { Button, Card, Header, Input } from '@/components/ui';
import { assertCampusWifiForJoin } from '@/services/campusWifiGate';
import { LobbyRepository } from '@/repositories';
import { useStudentStore, useLobbyStore } from '@/stores';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';
import { colors } from '@/theme';

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Enter the examination code')
    // Online: AB35NDD · Offline cache: OFF-12 · Legacy: ABCD-2026
    .regex(
      /^(OFF-\d+(?:-R\d+)?|[A-Za-z0-9]{6,12}(-\d{4})?)$/i,
      'Format example: K7M2P9QX or OFF-12-R3',
    ),
});

type FormValues = z.infer<typeof schema>;

export default function EnterCodeScreen() {
  const router = useRouter();
  const setScannedSession = useStudentStore((s) => s.setScannedSession);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '' },
  });

  const onVerify = handleSubmit(async (values) => {
    setError(null);
    // Validate network only AFTER the student submits a code.
    const gate = await assertCampusWifiForJoin({
      examinationCode: values.code,
      requireServer: true,
    });
    if (!gate.ok) {
      setError(
        gate.message ??
          'You are connected to a different examination network. Please connect to the same Wi‑Fi network as the proctor and try again.',
      );
      return;
    }

    const result = await LobbyRepository.verifyExaminationCode(values.code);
    if (!result.valid || !result.session || !result.schedule || result.session.status === 'ended') {
      setError(
        result.message ||
          (result.session?.status === 'ended'
            ? 'This examination has already ended and is no longer available for applicants.'
            : 'Invalid examination code.'),
      );
      return;
    }

    // PROBLEM 2 FIX: Clear old student state when entering a new exam code
    useStudentStore.getState().setVerifiedStudent(null);
    useStudentStore.getState().setSelectedStudent(null);
    useStudentStore.getState().setExamPasskey(null);
    useLobbyStore.getState().setSnapshot(null);
    await appStorage.deleteItem(STORAGE_KEYS.participationToken);
    await appStorage.deleteItem(STORAGE_KEYS.studentProgress);

    setScannedSession(result.schedule.id, result.session.id);
    router.replace('/(student)/passkey');
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Enter Examination Code"
        subtitle="Type the room code from your proctor"
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        <Card>
          <View style={styles.iconWrap}>
            <KeyRound size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Examination Code</Text>
          <Text style={styles.body}>
            Type this room’s code from your proctor (not the reconnect PIN). Example:
            K7M2P9QX. You will be asked to join the same Wi‑Fi as the proctor after you
            submit.
          </Text>

          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Examination Code"
                placeholder="K7M2P9QX"
                autoCapitalize="characters"
                autoCorrect={false}
                value={value}
                onChangeText={(text) => onChange(text.toUpperCase())}
                onBlur={onBlur}
                error={errors.code?.message}
                onSubmitEditing={onVerify}
              />
            )}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Verify Code"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={onVerify}
          />
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 16 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: 10 },
});
