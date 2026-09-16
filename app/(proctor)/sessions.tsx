import React from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '@/shared/components/ui/Header';
import { Breadcrumbs } from '@/shared/components/ui/Breadcrumbs';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SkeletonList } from '@/shared/components/ui/Skeleton';
import { SessionCard } from '@/features/schedules/components/SessionCard';
import { useSchedules, useSessions } from '@/features/schedules/hooks/useSchedules';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { safeBack } from '@/shared/utils';

export default function SessionsScreen() {
  const router = useRouter();
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const setSelectedSession = useProctorStore((s) => s.setSelectedSession);
  const selectedSchedule = useProctorStore((s) => s.selectedSchedule);
  const schedulesQuery = useSchedules();
  const sessionsQuery = useSessions(scheduleId);

  const schedule =
    selectedSchedule ??
    schedulesQuery.data?.find((item) => item.id === scheduleId) ??
    null;

  const scheduleName = schedule?.name ?? 'Schedule';

  const breadcrumbs = [
    { label: 'Schedules', onPress: () => router.replace('/(proctor)/(tabs)/examination') },
    { label: scheduleName },
  ];

  if (sessionsQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <Header
          title="Examination Time"
          subtitle={schedule?.name ?? 'Loading…'}
          onBack={() => safeBack(router, '/(proctor)/(tabs)/examination')}
        />
        <Breadcrumbs segments={breadcrumbs} />
        <View style={styles.list}>
          <SkeletonList rows={5} showAvatar={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Time"
        subtitle={schedule?.name ?? 'Select a session'}
        onBack={() => safeBack(router, '/(proctor)/(tabs)/examination')}
      />

      {/* BREADCRUMBS */}
      <Breadcrumbs segments={breadcrumbs} />

      <FlatList
        data={sessionsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.intro}>
            {schedule
              ? `${schedule.examinationDate} · ${schedule.batchCount} sessions available`
              : 'Available sessions'}
          </Text>
        }
        ListEmptyComponent={<EmptyState title="No sessions found" />}
        renderItem={({ item, index }) => (
          <SessionCard
            session={item}
            delay={index * 60}
            onPress={() => {
              setSelectedSession(item);
              router.push({
                pathname: '/(proctor)/rooms' as any,
                params: { sessionId: item.id, scheduleId },
              });
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0D0D' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 20, color: '#A1A1AA', fontWeight: '500', marginBottom: 4 },
});
