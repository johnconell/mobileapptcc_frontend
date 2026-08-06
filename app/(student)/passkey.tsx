import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react-native';
import { Button, Card, Header, Input, SkeletonForm } from '@/components/ui';
import { LobbyRepository } from '@/repositories';
import { useStudentStore } from '@/stores';
import { colors } from '@/theme';

const schema = z.object({
  passkey: z
    .string()
    .trim()
    .min(6, 'Enter your examination key')
    .max(12, 'Examination key is too long')
    .regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only'),
});

type FormValues = z.infer<typeof schema>;

export default function StudentPasskeyScreen() {
  const router = useRouter();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);
  const setExamPasskey = useStudentStore((s) => s.setExamPasskey);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { passkey: '' },
  });

  React.useEffect(() => {
    if (!scannedSessionId) {
      router.replace('/');
    }
  }, [scannedSessionId, router]);

  React.useEffect(() => {
    if (verifiedStudent && scannedSessionId) {
      router.replace('/(student)/lobby');
    }
  }, [verifiedStudent, scannedSessionId, router]);

  if (!scannedSessionId) {
    return (
      <View style={styles.screen}>
        <Header title="Examination Key" subtitle="Loading…" />
        <SkeletonForm fields={1} />
      </View>
    );
  }

  const onContinue = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await LobbyRepository.validatePasskey(values.passkey.trim());
      setExamPasskey(values.passkey.trim().toUpperCase());
      setSelectedStudent(result.student);
      router.push('/(student)/confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid examination key.');
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Examination Key"
        subtitle="Enter the key emailed to your Gmail"
        onBack={() => router.replace('/')}
      />
      <View style={styles.content}>
        <Card>
          <View style={styles.iconRow}>
            <KeyRound size={28} color={colors.primary} />
          </View>
          <Text style={styles.intro}>
            Use the unique examination key sent to your Gmail. Do not use another student&apos;s
            key.
          </Text>

          <Controller
            control={control}
            name="passkey"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Examination Key"
                placeholder="e.g. K7M2P9QX"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                value={value}
                onChangeText={(text) => onChange(text.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                onBlur={onBlur}
                error={errors.passkey?.message}
                maxLength={12}
              />
            )}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Continue"
            loading={isSubmitting}
            onPress={onContinue}
            style={styles.btn}
          />
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, flex: 1 },
  iconRow: { alignItems: 'center', marginBottom: 12 },
  intro: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    marginBottom: 18,
    textAlign: 'center',
  },
  error: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 13,
    color: '#B42318',
    fontWeight: '600',
  },
  btn: { marginTop: 16 },
});
