import React, { useCallback, useEffect, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Linking from 'expo-linking';
import { Shield } from 'lucide-react-native';
import { Button } from '@/shared/components/ui/Button';
import { Header } from '@/shared/components/ui/Header';
import { Input } from '@/shared/components/ui/Input';
import { Card } from '@/shared/components/ui/Card';
import {
  proctorLoginSchema,
  type ProctorLoginValues,
} from '@/features/authentication/validation/proctorLoginSchema';
import { useHardwareBack } from '@/shared/hooks/useHardwareBack';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import {
  getProctorGoogleRedirectUrl,
  isProctorGoogleCallback,
  parseProctorGoogleCallback,
} from '@/features/authentication/services/proctorGoogleAuth';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { colors } from '@/shared/theme';

let lastConsumedGoogleUrl: string | null = null;

export default function ProctorLoginScreen() {
  const router = useRouter();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);

  useEffect(() => {
    if (profile) {
      router.replace('/(proctor)/dashboard' as any);
    }
  }, [profile, router]);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const goToLanding = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/', params: { stay: '1', from: 'login' } });
  }, [router]);

  useHardwareBack(() => {
    goToLanding();
    return true;
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProctorLoginValues>({
    resolver: zodResolver(proctorLoginSchema),
    defaultValues: { username: '', password: '' },
  });

  const completeLogin = useCallback(
    (profile: NonNullable<Awaited<ReturnType<typeof AuthRepository.login>>['profile']>) => {
      setProfile(profile);
      router.replace('/(proctor)/dashboard' as any);
    },
    [router, setProfile],
  );

  const consumeGoogleUrl = useCallback(
    async (url: string | null) => {
      if (!url || !isProctorGoogleCallback(url) || url === lastConsumedGoogleUrl) return;
      lastConsumedGoogleUrl = url;
      const { token, error } = parseProctorGoogleCallback(url);
      setGoogleLoading(true);
      setFormError(null);
      try {
        if (error) {
          setFormError(error);
          return;
        }
        if (!token) {
          setFormError('Google sign-in did not return a session.');
          return;
        }
        const result = await AuthRepository.loginWithToken(token);
        if (!result.success || !result.profile) {
          setFormError(result.message ?? 'Google sign-in failed.');
          return;
        }
        completeLogin(result.profile);
      } finally {
        setGoogleLoading(false);
      }
    },
    [completeLogin],
  );

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      void consumeGoogleUrl(url);
    });
    void Linking.getInitialURL().then((url) => {
      void consumeGoogleUrl(url);
    });
    return () => sub.remove();
  }, [consumeGoogleUrl]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await AuthRepository.login(values.username, values.password);
    if (!result.success || !result.profile) {
      setFormError(result.message ?? 'Login failed');
      return;
    }
    completeLogin(result.profile);
  });

  const onGoogle = async () => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const url = await getProctorGoogleRedirectUrl();
      const opened = await Linking.openURL(url);
      if (!opened) {
        setFormError('Could not open Google sign-in. Check your internet connection.');
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Google sign-in is unavailable. Connect to the internet and try again.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Proctor Login" subtitle="Internet required to sign in" onBack={goToLanding} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.iconWrap}>
            <Shield size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>
            Sign in online with your proctor account. Offline exam access starts after you
            download the exam pack from the Examination tab.
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
            title="Sign in"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={onSubmit}
            style={{ marginTop: 16 }}
          />
          <Button
            title="Continue with Google"
            variant="outline"
            size="lg"
            fullWidth
            loading={googleLoading}
            onPress={() => void onGoogle()}
            style={{ marginTop: 12 }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
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
  sub: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 16 },
  error: { marginTop: 10, color: colors.danger, fontWeight: '600', fontSize: 13 },
});
