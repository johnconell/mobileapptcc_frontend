import React, { useEffect } from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, Loader, EmptyState, Button } from '@/components/ui';
import { ScheduleCard } from '@/features/proctor/ScheduleCard';
import { useSchedules } from '@/hooks/useRepositories';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';
import { colors } from '@/theme';

export default function SchedulesScreen() {
  const router = useRouter();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const setSelectedSchedule = useProctorStore((s) => s.setSelectedSchedule);
  const reset = useProctorStore((s) => s.reset);
  const schedulesQuery = useSchedules(Boolean(profile));

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
          <Text style={styles.intro}>Select an examination schedule to view available sessions.</Text>
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
  intro: {
    fontSize: 14,
    color: colors.inkSecondary,
    marginBottom: 8,
    lineHeight: 21,
  },
});
