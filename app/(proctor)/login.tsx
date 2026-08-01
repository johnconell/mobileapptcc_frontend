import React, { useEffect, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Shield, Wifi } from 'lucide-react-native';
import { Button, Header, Input, Card } from '@/components/ui';
import {
  proctorLoginSchema,
  type ProctorLoginValues,
} from '@/features/proctor/proctorLoginSchema';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';
import { MOCK_PROCTOR } from '@/constants';
import { clearLanApiUrl, getApiBaseUrl, hydrateApiBaseUrl, setLanApiUrl } from '@/services/api';
import {
  discoverLanExamServers,
  getWifiHint,
  type DiscoveredServer,
} from '@/services/lanDiscovery';
import { colors } from '@/theme';

export default function ProctorLoginScreen() {
  const router = useRouter();
  const setProfile = useProctorStore((s) => s.setProfile);
  const [formError, setFormError] = useState<string | null>(null);
  const [lanUrl, setLanUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [wifiHint, setWifiHint] = useState('');
  const [servers, setServers] = useState<DiscoveredServer[]>([]);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProctorLoginValues>({
    resolver: zodResolver(proctorLoginSchema),
    defaultValues: { username: '', password: '' },
  });

  useEffect(() => {
    void hydrateApiBaseUrl().then((url) => setLanUrl(url));
    void getWifiHint().then(setWifiHint);
    void AuthRepository.getSession().then((session) => {
      if (session) {
        setProfile(session);
        router.replace('/(proctor)/schedules');
      }
    });
  }, [setProfile, router]);

  const saveLanServer = async (url = lanUrl) => {
    setSavingUrl(true);
    setFormError(null);
    try {
      const saved = await setLanApiUrl(url);
      setLanUrl(saved);
      Alert.alert('Exam server saved', `Phones will use:\n${saved}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Invalid LAN URL');
    } finally {
      setSavingUrl(false);
    }
  };

  const findServers = async () => {
    setScanning(true);
    setFormError(null);
    setServers([]);
    setScanProgress('Starting…');
    try {
      setWifiHint(await getWifiHint());
      const found = await discoverLanExamServers((done, total) => {
        setScanProgress(`Scanning Wi‑Fi… ${done}/${total}`);
      });
      setServers(found);
      if (!found.length) {
        Alert.alert(
          'No exam server found',
          'Make sure the room PC is on the same Wi‑Fi and running:\nphp artisan serve --host=0.0.0.0 --port=8000\n\nOr use Offline pack (no room PC) from the home screen.',
        );
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Scan failed');
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (lanUrl.trim()) {
        await setLanApiUrl(lanUrl);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Invalid LAN URL');
      return;
    }
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
      <Header
        title="Proctor Login"
        subtitle="Find exam server on Wi‑Fi"
        onBack={() => router.replace('/')}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.iconWrap}>
            <Shield size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.sub}>
            You do not pick Wi‑Fi names here — join the exam Wi‑Fi in phone Settings,
            then tap Find servers to list PCs running the exam API.
          </Text>

          <Text style={styles.wifiHint}>{wifiHint || 'Checking Wi‑Fi…'}</Text>

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

          {servers.length > 0 ? (
            <View style={styles.serverList}>
              <Text style={styles.serverLabel}>Tap a server to use it</Text>
              {servers.map((s) => (
                <Pressable
                  key={s.ip}
                  style={[
                    styles.serverItem,
                    lanUrl.includes(s.ip) && styles.serverItemActive,
                  ]}
                  onPress={() => void saveLanServer(s.url)}
                >
                  <Wifi size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serverTitle}>{s.label}</Text>
                    <Text style={styles.serverUrl}>{s.url}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Input
            label="Or type server URL (advanced)"
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
              loading={savingUrl}
              onPress={() => void saveLanServer()}
              style={{ flex: 1 }}
            />
            <Button
              title="Reset"
              variant="ghost"
              onPress={async () => {
                await clearLanApiUrl();
                const url = getApiBaseUrl();
                setLanUrl(url);
              }}
            />
          </View>

          <Button
            title="No room PC? Use Offline pack"
            variant="ghost"
            fullWidth
            onPress={() => router.push('/offline-prepare')}
          />

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
            Current: {getApiBaseUrl()}
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
  sub: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, marginBottom: 12 },
  wifiHint: {
    fontSize: 12,
    color: colors.inkMuted,
    marginBottom: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  scanText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  serverList: { marginTop: 12, marginBottom: 8, gap: 8 },
  serverLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  serverItemActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0D9DC',
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
