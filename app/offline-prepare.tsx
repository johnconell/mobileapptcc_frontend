import React, { useEffect, useState } from 'react';
import { Alert, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Button, Card, Skeleton } from '@/shared/components/ui';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { getCloudApiBaseUrl, getApiBaseUrl } from '@/shared/services/api';
import { colors } from '@/shared/theme';
import { safeBack } from '@/shared/utils';
import { userFacingError } from '@/shared/utils/userFacingError';
import { useSkeletonLoadingTimeout } from '@/components/skeleton';

export default function OfflinePrepareScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);
  const [meta, setMeta] = useState<{ ready: boolean; at: string | null }>({
    ready: false,
    at: null,
  });
  const [pending, setPending] = useState(0);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataRetryAttempt, setMetadataRetryAttempt] = useState(0);
  const metadataTimedOut = useSkeletonLoadingTimeout(
    metadataLoading,
    10_000,
    metadataRetryAttempt,
  );

  const refresh = async () => {
    setMetadataLoading(true);
    setMetadataError(null);
    try {
      const [nextMeta, queuedResults] = await Promise.all([
        OfflineStore.getPackMeta(),
        OfflineStore.pendingResults(),
      ]);
      setMeta(nextMeta);
      setPending(queuedResults.length);
    } catch (error) {
      console.error('Failed to load offline exam-pack status:', error);
      setMetadataError(userFacingError(error, 'Unable to load cached examination data.'));
    } finally {
      setMetadataLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [metadataRetryAttempt]);

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
        userFacingError(
          error,
          'Unable to download the examination pack. Connect to the internet and try again.',
        ),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const pendingBeforeSync = pending;
      const result = await OfflineExamRepository.syncQueuedToCloud();
      await refresh();
      Alert.alert(
        result.synced === 0
          ? 'No results to sync'
          : result.synced < pendingBeforeSync
            ? 'Partial sync'
            : 'Sync complete',
        result.message,
      );
    } catch (error) {
      Alert.alert(
        'Sync failed',
        userFacingError(
          error,
          'Results are saved locally but could not be synchronized. Reconnect to the internet and retry.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    setBusy(true);
    try {
      const res = await OfflineExamRepository.recoverAndResendUnsynced();
      await refresh();
      Alert.alert('Recovery Result', res.message);
    } catch (error) {
      Alert.alert(
        'Recovery Failed',
        userFacingError(
          error,
          'Unable to recover unsynchronized results. Your local queue has been kept; retry after checking storage.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Offline exam cache"
        subtitle="Synchronize with Admin"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(proctor)/(tabs)/dashboard'))}
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
          {metadataLoading && !metadataTimedOut ? (
            <View style={styles.metadataSkeletonRows}>
              <Skeleton height={13} width="68%" />
              <Skeleton height={13} width="55%" />
            </View>
          ) : metadataError || metadataTimedOut ? (
            <View style={styles.metadataError}>
              <Text style={styles.meta}>
                {metadataTimedOut
                  ? 'Loading exam-pack status took too long.'
                  : metadataError}
              </Text>
              <Button
                title="Retry"
                variant="outline"
                onPress={() => {
                  setMetadataRetryAttempt((attempt) => attempt + 1);
                }}
              />
            </View>
          ) : (
            <>
              <Text style={styles.meta}>
                Cache: {meta.ready ? `Ready${meta.at ? ` · ${new Date(meta.at).toLocaleString()}` : ''}` : 'Not downloaded'}
              </Text>
              <Text style={styles.meta}>Pending results to sync: {pending}</Text>
            </>
          )}
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
          title="Recover Unsynced Results"
          variant="ghost"
          fullWidth
          loading={busy}
          onPress={() => void recover()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, gap: 14 },
  metadataSkeletonRows: { gap: 10, paddingTop: 4 },
  metadataError: { gap: 8, alignItems: 'flex-start' },
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
