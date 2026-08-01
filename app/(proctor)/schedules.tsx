import React, { useEffect, useState } from 'react';
import { FlatList, Text, View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Header, Loader, EmptyState, Button } from '@/components/ui';
import { ScheduleCard } from '@/features/proctor/ScheduleCard';
import { useSchedules } from '@/hooks/useRepositories';
import { AuthRepository, LobbyRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useProctorStore } from '@/stores';
import { getApiBaseUrl } from '@/services/api';
import { colors } from '@/theme';

export default function SchedulesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const setSelectedSchedule = useProctorStore((s) => s.setSelectedSchedule);
  const reset = useProctorStore((s) => s.reset);
  const schedulesQuery = useSchedules(Boolean(profile));
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    if (!profile) {
      void AuthRepository.getSession().then((session) => {
        if (session) setProfile(session);
        else router.replace('/(proctor)/login');
      });
    }
  }, [profile, setProfile, router]);

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

  const pullFromAdmin = async () => {
    setPulling(true);
    try {
      const result = await LobbyRepository.pullFromAdmin();
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
      Alert.alert('Exam data updated', result.message);
    } catch (error) {
      Alert.alert(
        'Pull failed',
        error instanceof Error
          ? error.message
          : 'Connect the LAN exam PC to the internet, set ADMIN_SYNC_* , then try again.',
      );
    } finally {
      setPulling(false);
    }
  };

  if (!profile || (schedulesQuery.isLoading && !schedulesQuery.data)) {
    return <Loader fullscreen label="Loading schedules…" />;
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Schedules"
        subtitle={profile.displayName}
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
              Select a schedule. For offline exams, students enter code OFF-12 (use the
              schedule number shown on the card).
            </Text>
            <Text style={styles.serverLine}>Exam server: {getApiBaseUrl()}</Text>
            <Button
              title="Download / sync offline pack"
              variant="outline"
              fullWidth
              onPress={() => router.push('/offline-prepare')}
            />
            <Button
              title="Pull exam data from Admin (LAN PC)"
              variant="outline"
              fullWidth
              loading={pulling}
              onPress={() => void pullFromAdmin()}
            />
            <Text style={styles.pullHint}>
              Preferred (no room PC): use Offline pack — cache on the phone, exam without
              internet, then Sync results to Admin.
            </Text>
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
        ListFooterComponent={
          <Button
            title="Sign out"
            variant="ghost"
            onPress={async () => {
              await AuthRepository.logout();
              reset();
              router.replace('/');
            }}
            style={{ marginTop: 8 }}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, gap: 12, paddingBottom: 40 },
  headerBlock: { gap: 10, marginBottom: 8 },
  intro: {
    fontSize: 14,
    color: colors.inkSecondary,
    lineHeight: 21,
  },
  serverLine: {
    fontSize: 12,
    color: colors.inkMuted,
    fontWeight: '600',
  },
  pullHint: {
    fontSize: 12,
    color: colors.inkMuted,
    lineHeight: 18,
  },
});
