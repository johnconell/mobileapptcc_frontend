import React, { useEffect, useState } from 'react';
import { FlatList, Text, View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Header, Loader, EmptyState, Button } from '@/components/ui';
import { ScheduleCard } from '@/features/proctor/ScheduleCard';
import { useSchedules } from '@/hooks/useRepositories';
import { AuthRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useProctorStore } from '@/stores';
import { ensureExamPackCached } from '@/services/ensureExamPack';
import { OfflineStore } from '@/services/offlineStore';
import { colors } from '@/theme';

export default function SchedulesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const setSelectedSchedule = useProctorStore((s) => s.setSelectedSchedule);
  const reset = useProctorStore((s) => s.reset);
  const schedulesQuery = useSchedules(Boolean(profile));
  const [refreshing, setRefreshing] = useState(false);
  const [packAt, setPackAt] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      void AuthRepository.getSession().then((session) => {
        if (session) setProfile(session);
        else router.replace('/(proctor)/login');
      });
    }
  }, [profile, setProfile, router]);

  useEffect(() => {
    void OfflineStore.getPackMeta().then((m) => setPackAt(m.at));
  }, []);

  useEffect(() => {
    if (schedulesQuery.isError) {
      const err = schedulesQuery.error as { status?: number } | null;
      if (err?.status === 401 || err?.status === 403) {
        void AuthRepository.logout().then(() => {
          reset();
          router.replace('/(proctor)/login');
        });
      }
    }
  }, [schedulesQuery.isError, schedulesQuery.error, reset, router]);

  const refreshCache = async () => {
    setRefreshing(true);
    try {
      const result = await ensureExamPackCached({ force: true });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
      const meta = await OfflineStore.getPackMeta();
      setPackAt(meta.at);
      Alert.alert(result.ok ? 'Cache updated' : 'Update failed', result.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (!profile || (schedulesQuery.isLoading && !schedulesQuery.data)) {
    return <Loader fullscreen label="Please wait — loading schedules…" />;
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
            <Text style={styles.intro}>
              Select a schedule, then a room. Each room gets a random letter+number code and
              its own QR (example K7M2P9QX · offline OFF-12-R3). When every room has ended,
              the batch shows as complete.
            </Text>
            {packAt ? (
              <Text style={styles.cacheLine}>
                Exam cache updated: {new Date(packAt).toLocaleString()}
              </Text>
            ) : (
              <Text style={styles.cacheLine}>Exam cache not ready yet.</Text>
            )}
            <Button
              title="Refresh exam cache"
              variant="outline"
              fullWidth
              loading={refreshing}
              onPress={() => void refreshCache()}
            />
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
  cacheLine: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
});
