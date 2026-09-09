import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  BackHandler,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Shield, Wifi } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonForm } from '@/components/ui/Skeleton';
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
  getApiBaseUrl,
  hydrateApiBaseUrl,
  setLanApiUrl,
} from '@/services/api';
import {
  discoverLanExamServers,
  getWifiHint,
  type DiscoveredServer,
} from '@/services/lanDiscovery';
import { ensureExamPackCached } from '@/services/ensureExamPack';
import { OfflineStore } from '@/services/offlineStore';
import { ProctorAuthCache } from '@/services/proctorAuthCache';
import { colors } from '@/theme';
import { VersionInfo } from '@/components/VersionInfo';

export default function ProctorLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const setProfile = useProctorStore((s) => s.setProfile);
  const [formError, setFormError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareLabel, setPrepareLabel] = useState('Please wait…');
  const [booting, setBooting] = useState(true);
  const [authCacheReady, setAuthCacheReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [wifiHint, setWifiHint] = useState('');
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [lanUrl, setLanUrl] = useState(getApiBaseUrl());

  // Hardware back returns cleanly to landing page
  useEffect(() => {
    const handleBack = () => {
      router.replace({ pathname: '/', params: { stay: '1', from: 'login' } } as any);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [router]);

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
      setPrepareLabel('Opening dashboard…');
      router.replace('/(proctor)/dashboard' as any);
      return;
    }

    setPrepareLabel('Please wait — updating exam cache and proctor accounts…');
    const pack = await ensureExamPackCached({ force: true, includeAuth: true });
    if (!pack.ok) {
      setPreparing(false);
      setFormError(pack.message);
      return;
    }
    setPrepareLabel('Opening dashboard…');
    router.replace('/(proctor)/dashboard' as any);
  };

  useEffect(() => {
    void (async () => {
      await hydrateApiBaseUrl();

      // While online on the login screen: pre-download exam pack + proctor accounts
      // so this phone can log in later without internet.
      setPrepareLabel('Please wait — preparing offline login cache…');
      const warmed = await ensureExamPackCached({ force: false, includeAuth: true });
      if (!warmed.fromCache || !(await ProctorAuthCache.hasAccounts())) {
        await ensureExamPackCached({ force: true, includeAuth: true });
      }
      setAuthCacheReady(await ProctorAuthCache.hasAccounts());
      setLanUrl(getApiBaseUrl());
      setWifiHint(await getWifiHint());
      setBooting(false);
    })();
  }, []);

  const findServers = async () => {
    setScanning(true);
    setFormError(null);
    setServers([]);
    try {
      setWifiHint(await getWifiHint());
      const found = await discoverLanExamServers((done, total) => {
        setScanProgress(`Scanning Wi‑Fi… ${done}/${total}`);
      });
      setServers(found);
      if (!found.length) {
        Alert.alert(
          'No exam server found',
          'Join the exam Wi‑Fi, keep Laravel on 0.0.0.0:8000, then try again. Or type the LAN URL below.',
        );
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Scan failed');
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  };

  const saveFoundServer = async (url: string) => {
    try {
      const saved = await setLanApiUrl(url);
      setLanUrl(saved);
      Alert.alert('Exam server saved', saved);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Invalid LAN URL');
    }
  };

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
    return (
      <View style={styles.screen}>
        <Header title="Proctor Login" subtitle={prepareLabel} />
        <SkeletonForm fields={2} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Proctor Login"
        subtitle="Online or offline (after first cache)"
        onBack={() => {
          router.replace({ pathname: '/', params: { stay: '1', from: 'login' } } as any);
        }}
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

          <Text style={styles.wifiHint}>{wifiHint || 'Connect to exam Wi‑Fi to find the room server.'}</Text>
          <Button
            title={scanning ? 'Scanning this Wi‑Fi…' : 'Find servers on this Wi‑Fi'}
            variant="outline"
            fullWidth
            loading={scanning}
            icon={<Wifi size={16} color={colors.primary} />}
            onPress={() => void findServers()}
          />
          {scanning ? (
            <View style={styles.scanRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.scanText}>{scanProgress}</Text>
            </View>
          ) : null}
          {servers.map((s) => (
            <Pressable
              key={s.ip}
              style={styles.serverItem}
              onPress={() => void saveFoundServer(s.url)}
            >
              <Wifi size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.serverTitle}>{s.label}</Text>
                <Text style={styles.serverUrl}>{s.url}</Text>
              </View>
            </Pressable>
          ))}
          <Input
            label="LAN exam server URL"
            placeholder="http://10.x.x.x:8000/api/v1"
            autoCapitalize="none"
            autoCorrect={false}
            value={lanUrl}
            onChangeText={setLanUrl}
          />
          <View style={styles.urlActions}>
            <Button
              title="Save server"
              variant="outline"
              onPress={() => void saveFoundServer(lanUrl)}
              style={{ flex: 1 }}
            />
            <Button
              title="Reset"
              variant="ghost"
              onPress={async () => {
                await clearLanApiUrl();
                setLanUrl(getApiBaseUrl());
              }}
            />
          </View>

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

        <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
           <VersionInfo />
        </View>
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
  wifiHint: {
    fontSize: 12,
    color: colors.inkMuted,
    marginBottom: 8,
    fontWeight: '600',
    lineHeight: 18,
  },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginTop: 8,
  },
  serverTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  serverUrl: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  urlActions: { flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 8 },
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
