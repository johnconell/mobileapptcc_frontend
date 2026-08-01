import React, { useState } from 'react';
import { Text, View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react-native';
import { Button, Card, Header, Input } from '@/components/ui';
import { LobbyRepository } from '@/repositories';
import { useStudentStore } from '@/stores';
import { colors } from '@/theme';

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Enter the examination code')
    // Online: AB35NDD · Offline cache: OFF-12 · Legacy: ABCD-2026
    .regex(/^(OFF-\d+|[A-Za-z0-9]{6,12}(-\d{4})?)$/i, 'Format example: AB35NDD or OFF-12'),
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
    const result = await LobbyRepository.verifyExaminationCode(values.code);
    if (!result.valid || !result.session || !result.schedule) {
      setError(result.message ?? 'Invalid examination code.');
      return;
    }
    setScannedSession(result.schedule.id, result.session.id);
    router.replace('/(student)/verify');
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Enter Examination Code"
        subtitle="Provided by your proctor"
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        <Card>
          <View style={styles.iconWrap}>
            <KeyRound size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Examination Code</Text>
          <Text style={styles.body}>
            Type the code from your proctor. Online lobby: AB35NDD. Offline cache mode: OFF-12
            (schedule number).
          </Text>

          <Controller
            control={control}
            name="code"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Examination Code"
                placeholder="AB35NDD"
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
            style={{ marginTop: 16 }}
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
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 16 },
  error: { marginTop: 10, color: colors.danger, fontWeight: '600', fontSize: 13 },
});
