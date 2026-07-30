import React from 'react';
import { FlatList, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header, Loader, EmptyState } from '@/components/ui';
import { SessionCard } from '@/features/proctor/SessionCard';
import { useSchedules, useSessions } from '@/hooks/useRepositories';
import { useProctorStore } from '@/stores';
import { colors } from '@/theme';

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

  if (sessionsQuery.isLoading) {
    return <Loader fullscreen label="Loading examination times…" />;
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Time"
        subtitle={schedule?.name ?? 'Select a session'}
        onBack={() => router.back()}
      />
      <FlatList
        data={sessionsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.intro}>
            {schedule
              ? `${schedule.examinationDate} · ${schedule.batchCount} sessions`
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
                pathname: '/(proctor)/lobby',
                params: { sessionId: item.id },
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
  intro: { fontSize: 14, color: colors.inkSecondary, marginBottom: 8, lineHeight: 21 },
});
