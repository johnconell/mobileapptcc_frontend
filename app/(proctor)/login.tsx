import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Shield } from 'lucide-react-native';
import { Button, Header, Input, Card } from '@/components/ui';
import {
  proctorLoginSchema,
  type ProctorLoginValues,
} from '@/features/proctor/proctorLoginSchema';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';
import { MOCK_PROCTOR } from '@/constants';
import { colors } from '@/theme';

export default function ProctorLoginScreen() {
  const router = useRouter();
  const setProfile = useProctorStore((s) => s.setProfile);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProctorLoginValues>({
    resolver: zodResolver(proctorLoginSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => {
    void AuthRepository.getSession().then((session) => {
      if (session) {
        setProfile(session);
        router.replace('/(proctor)/schedules');
      }
    });
  }, [setProfile, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await AuthRepository.login(values.username, values.password);
    if (!result.success || !result.profile) {
      setFormError(result.message ?? 'Login failed');
      return;
    }
    setProfile(result.profile);
    router.replace('/(proctor)/schedules');
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Proctor Login" subtitle="Secure local access" onBack={() => router.replace('/')} />
      <View style={styles.content}>
        <Card>
          <View style={styles.iconWrap}>
            <Shield size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>
            Use your proctor credentials to manage examination schedules and lobbies.
          </Text>

          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Email"
                placeholder="proctor@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.username?.message}
              />
            )}
          />
          <View style={{ height: 12 }} />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Password"
                placeholder="••••••••"
                secureTextEntry
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                onSubmitEditing={onSubmit}
              />
            )}
          />

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <Button
            title="Login"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={onSubmit}
            style={{ marginTop: 16 }}
          />

          <Text style={styles.hint}>
            Demo: {MOCK_PROCTOR.username} / {MOCK_PROCTOR.password}
          </Text>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 18 },
  error: { marginTop: 10, color: colors.danger, fontWeight: '600', fontSize: 13 },
  hint: {
    marginTop: 14,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
});
