import React, { useEffect, useState } from 'react';
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
import { Shield } from 'lucide-react-native';
import { Button, Header, Input, Card, Loader } from '@/components/ui';
import {
  proctorLoginSchema,
  type ProctorLoginValues,
} from '@/features/proctor/proctorLoginSchema';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';
import { MOCK_PROCTOR } from '@/constants';
import {
  clearLanApiUrl,
  getAuthApiBaseUrl,
  getCloudApiBaseUrl,
  hasLanApiOverride,
  hydrateApiBaseUrl,
} from '@/services/api';
import { ensureExamPackCached } from '@/services/ensureExamPack';
import { OfflineStore } from '@/services/offlineStore';
import { ProctorAuthCache } from '@/services/proctorAuthCache';
import { colors } from '@/theme';

export default function ProctorLoginScreen() {
  const router = useRouter();
  const setProfile = useProctorStore((s) => s.setProfile);
  const [formError, setFormError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareLabel, setPrepareLabel] = useState('Please wait…');
  const [booting, setBooting] = useState(true);
  const [authCacheReady, setAuthCacheReady] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProctorLoginValues>({
    resolver: zodResolver(proctorLoginSchema),
    defaultValues: { username: '', password: '' },
  });

  const finishLogin = async (offlineSession: boolean) => {
    setPreparing(true);
    if (offlineSession) {
      const meta = await OfflineStore.getPackMeta();
      if (!meta.ready) {
        setPreparing(false);
        setFormError(
          'Logged in offline, but this phone has no exam cache yet. Connect to the internet once to download schedules and questions.',
        );
        return;
      }
      setPrepareLabel('Opening offline schedules…');
      router.replace('/(proctor)/schedules');
      return;
    }

    setPrepareLabel('Please wait — updating exam cache and proctor accounts…');
    const pack = await ensureExamPackCached({ force: true, includeAuth: true });
    if (!pack.ok) {
      setPreparing(false);
      setFormError(pack.message);
      return;
    }
    setPrepareLabel('Opening schedules…');
    router.replace('/(proctor)/schedules');
  };

  useEffect(() => {
    void (async () => {
      await hydrateApiBaseUrl();
      if (hasLanApiOverride() && getCloudApiBaseUrl()) {
        await clearLanApiUrl();
      }
      const session = await AuthRepository.getSession();
      if (session) {
        setProfile(session);
        setBooting(false);
        setPreparing(true);
        if (session.offlineSession) {
          setPrepareLabel('Opening offline schedules…');
          router.replace('/(proctor)/schedules');
          return;
        }
        setPrepareLabel('Please wait — updating exam cache and schedules…');
        await ensureExamPackCached({ force: true, includeAuth: true });
        router.replace('/(proctor)/schedules');
        return;
      }

      // While online on the login screen: pre-download exam pack + proctor accounts
      // so this phone can log in later without internet.
      setPrepareLabel('Please wait — preparing offline login cache…');
      const warmed = await ensureExamPackCached({ force: false, includeAuth: true });
      if (!warmed.fromCache || !(await ProctorAuthCache.hasAccounts())) {
        await ensureExamPackCached({ force: true, includeAuth: true });
      }
      setAuthCacheReady(await ProctorAuthCache.hasAccounts());
      setBooting(false);
    })();
  }, [setProfile, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await AuthRepository.login(values.username, values.password);
    if (!result.success || !result.profile) {
      setFormError(result.message ?? 'Login failed');
      return;
    }
    setProfile(result.profile);
    await finishLogin(Boolean(result.profile.offlineSession));
  });

  if (booting || preparing) {
    return <Loader fullscreen label={prepareLabel} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Proctor Login"
        subtitle="Online or offline (after first cache)"
        onBack={() => router.replace('/')}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.iconWrap}>
            <Shield size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>
            When this phone has internet, proctor accounts and exam data are cached
            automatically. After that you can log in offline and run OFF- schedule exams
            from the cache. Live LAN lobby still needs the exam computer online.
          </Text>
          <Text style={styles.cacheStatus}>
            {authCacheReady
              ? 'Offline login cache: ready'
              : 'Offline login cache: not ready (needs internet once)'}
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
            {'\n'}
            Server: {getAuthApiBaseUrl()}
          </Text>
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
  sub: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 8 },
  cacheStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 14,
  },
  error: { marginTop: 10, color: colors.danger, fontWeight: '600', fontSize: 13 },
  hint: {
    marginTop: 14,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
});
