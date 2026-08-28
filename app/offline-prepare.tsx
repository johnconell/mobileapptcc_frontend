import React, { useEffect, useState } from 'react';
import { Alert, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Button, Card, Skeleton, SkeletonCard, SkeletonText } from '@/components/ui';
import { OfflineExamRepository } from '@/services/offlineExamRepository';
import { OfflineStore } from '@/services/offlineStore';
import { getCloudApiBaseUrl, getApiBaseUrl } from '@/services/api';
import { colors } from '@/theme';
import { safeBack } from '@/utils';

export default function OfflinePrepareScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);
  const [meta, setMeta] = useState<{ ready: boolean; at: string | null }>({
    ready: false,
    at: null,
  });
  const [pending, setPending] = useState(0);

  const refresh = async () => {
    setMeta(await OfflineStore.getPackMeta());
    setPending((await OfflineStore.pendingResults()).length);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const download = async () => {
    setBusy(true);
    setProgress({ percent: 0, label: 'Starting…' });
    try {
      await OfflineExamRepository.downloadPackFromCloud(undefined, {
        includeAuth: true,
        onProgress: setProgress,
      });
      await refresh();
      Alert.alert(
        'Exam cached',
        'Schedules, student names, and questions are saved on this phone. You can turn off internet and continue.',
      );
    } catch (error) {
      Alert.alert(
        'Download failed',
        error instanceof Error
          ? error.message
          : 'Connect to the internet / school Wi‑Fi and try again.',
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const result = await OfflineExamRepository.syncQueuedToCloud();
      await refresh();
      Alert.alert('Synced', result.message);
    } catch (error) {
      Alert.alert(
        'Sync failed',
        error instanceof Error
          ? error.message
          : 'Turn on internet, then sync again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Offline exam cache"
        subtitle="No room PC required"
        onBack={() => safeBack(router, '/')}
      />
      <View style={styles.body}>
        <Button
          title={
            progress
              ? `Downloading… ${progress.percent}%`
              : 'Download exam pack (needs internet)'
          }
          size="lg"
          fullWidth
          loading={busy && !progress}
          disabled={Boolean(progress)}
          onPress={() => void download()}
        />

        <Card>
          <Text style={styles.title}>How it works</Text>
          <Text style={styles.bodyText}>
            1. Admin imports students and sends examination keys by exam date.{'\n'}
            2. On school Wi‑Fi, download (or re-download) the pack so this phone gets the latest
            schedules, names, passkeys, and questions.{'\n'}
            3. Take / proctor the exam with mobile data OFF — everything runs from cache.{'\n'}
            4. When online again, sync results to the admin cloud database.
          </Text>
        </Card>

        <Card>
          <Text style={styles.meta}>
            Cloud API: {getCloudApiBaseUrl() || getApiBaseUrl()}
          </Text>
          <Text style={styles.meta}>
            Cache: {meta.ready ? `Ready${meta.at ? ` · ${new Date(meta.at).toLocaleString()}` : ''}` : 'Not downloaded'}
          </Text>
          <Text style={styles.meta}>Pending results to sync: {pending}</Text>
        </Card>

        {progress ? (
          <Card>
            <Text style={styles.title}>
              {progress.label} · {progress.percent}%
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, progress.percent)}%` }]} />
            </View>
          </Card>
        ) : busy ? (
          <SkeletonCard>
            <Skeleton height={13} width="50%" />
            <SkeletonText lines={2} />
          </SkeletonCard>
        ) : null}

        <Button
          title={`Sync results to Admin (${pending})`}
          variant="outline"
          size="lg"
          fullWidth
          loading={busy}
          disabled={pending === 0}
          onPress={() => void sync()}
        />
        <Button
          title="Continue to proctor login"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/(proctor)/login')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, gap: 14 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  bodyText: { fontSize: 14, lineHeight: 22, color: colors.inkSecondary },
  meta: { fontSize: 13, color: colors.inkMuted, marginBottom: 6, fontWeight: '600' },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
});
