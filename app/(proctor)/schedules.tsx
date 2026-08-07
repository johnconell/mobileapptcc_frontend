import React, { useEffect, useState } from 'react';
import { FlatList, Text, View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Header,
  EmptyState,
  Button,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonText,
} from '@/components/ui';
import { ScheduleCard } from '@/features/proctor/ScheduleCard';
import { useSchedules } from '@/hooks/useRepositories';
import { AuthRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useProctorStore } from '@/stores';
import { ensureExamPackCached } from '@/services/ensureExamPack';
import { OfflineStore } from '@/services/offlineStore';
import { colors } from '@/theme';

type PackSummary = Awaited<ReturnType<typeof OfflineStore.getPackSummary>>;

export default function SchedulesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const setSelectedSchedule = useProctorStore((s) => s.setSelectedSchedule);
  const reset = useProctorStore((s) => s.reset);
  const schedulesQuery = useSchedules(Boolean(profile));
  const [refreshing, setRefreshing] = useState(false);
  const [pack, setPack] = useState<PackSummary | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!profile) {
      void AuthRepository.getSession().then((session) => {
        if (session) setProfile(session);
        else router.replace('/(proctor)/login');
      });
    }
  }, [profile, setProfile, router]);

  useEffect(() => {
    void OfflineStore.getPackSummary().then(setPack);
  }, []);

  // When internet returns, push any queued offline results without blocking the UI.
  useEffect(() => {
    let cancelled = false;
    const trySync = async () => {
      try {
        const pending = await OfflineStore.pendingResults();
        if (!pending.length || cancelled) return;
        const { OfflineExamRepository } = await import('@/services/offlineExamRepository');
        await OfflineExamRepository.syncQueuedToCloud();
      } catch {
        // Stay silent — proctor can sync manually from Offline prepare.
      }
    };
    void trySync();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (schedulesQuery.isError) {
      const err = schedulesQuery.error as { status?: number } | null;
      // Network errors must NOT force logout when a pack is already on the phone.
      if (err?.status === 401 || err?.status === 403) {
        void AuthRepository.logout().then(() => {
          reset();
          router.replace('/(proctor)/login');
        });
      }
    }
  }, [schedulesQuery.isError, schedulesQuery.error, reset, router]);

  const downloadPack = async () => {
    setRefreshing(true);
    setDownloadProgress({ percent: 0, label: 'Starting…' });
    try {
      const result = await ensureExamPackCached({
        force: true,
        includeAuth: true,
        onProgress: setDownloadProgress,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
      const summary = await OfflineStore.getPackSummary();
      setPack(summary);
      Alert.alert(
        result.ok ? 'Exam pack downloaded' : 'Download failed',
        result.ok
          ? `${summary.students} student(s), ${summary.questions} question(s) and ` +
              `${summary.schedules} schedule(s) are now stored on this phone. ` +
              'You can run the examination without the server.'
          : result.message,
      );
    } finally {
      setRefreshing(false);
      setDownloadProgress(null);
    }
  };

  const loadingSchedules = !profile || (schedulesQuery.isLoading && !schedulesQuery.data);

  if (loadingSchedules) {
    return (
      <View style={styles.screen}>
        <Header title="Examination Schedules" subtitle="Loading…" />
        <View style={styles.list}>
          <SkeletonCard>
            <Skeleton height={16} width="45%" />
            <SkeletonText lines={2} />
            <Skeleton height={48} radius={14} />
          </SkeletonCard>
          <SkeletonList rows={4} showAvatar={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Schedules"
        subtitle={
          profile.offlineSession
            ? `${profile.displayName} · Offline mode`
            : profile.displayName
        }
        onBack={async () => {
          await AuthRepository.logout();
          reset();
          router.replace('/');
        }}
      />
      <FlatList
        data={schedulesQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={[styles.packCard, pack?.ready && styles.packCardReady]}>
              <Text style={styles.packTitle}>Offline exam pack</Text>
              <Text style={styles.packBody}>
                {pack?.ready
                  ? `${pack.students} student detail(s) · ${pack.questions} questionnaire item(s) · ${pack.schedules} schedule(s) · ${pack.passkeys} passkey(s) stored on this phone.`
                  : 'Download the student details and questionnaire while the server is reachable. Every phone that will run an examination needs its own copy.'}
              </Text>
              {pack?.at ? (
                <Text style={styles.packMeta}>
                  Last downloaded {new Date(pack.at).toLocaleString()}
                </Text>
              ) : null}
              {downloadProgress ? (
                <View style={styles.progressBlock}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.max(4, downloadProgress.percent)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    {downloadProgress.label} · {downloadProgress.percent}%
                  </Text>
                </View>
              ) : null}
              <Button
                title={
                  downloadProgress
                    ? `Downloading… ${downloadProgress.percent}%`
                    : pack?.ready
                      ? 'Download again'
                      : 'Download exam pack'
                }
                variant={pack?.ready && !downloadProgress ? 'outline' : 'primary'}
                fullWidth
                loading={refreshing && !downloadProgress}
                disabled={Boolean(downloadProgress)}
                onPress={() => void downloadPack()}
              />
            </View>
            <Text style={styles.intro}>
              Select a schedule, then a room. Opening a room generates a normal examination
              code and QR (example K7M2P9QX). Rooms stay Closed until you open them. When
              every room has ended, the batch shows as complete.
            </Text>
            <Button
              title="Sync offline results to Admin"
              variant="ghost"
              fullWidth
              onPress={() => router.push('/offline-prepare')}
            />
          </View>
        }
        ListEmptyComponent={<EmptyState title="No schedules available" />}
        renderItem={({ item, index }) => (
          <ScheduleCard
            schedule={item}
            delay={index * 60}
            onPress={() => {
              setSelectedSchedule(item);
              router.push({
                pathname: '/(proctor)/sessions',
                params: { scheduleId: item.id },
              });
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, gap: 12, paddingBottom: 40 },
  headerBlock: { gap: 10, marginBottom: 8 },
  intro: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary, fontWeight: '500' },
  packCard: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  packCardReady: { borderColor: colors.success },
  packTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  packBody: { fontSize: 13, lineHeight: 20, color: colors.inkSecondary, fontWeight: '500' },
  packMeta: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  progressBlock: { gap: 6 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  progressLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSecondary },
});
