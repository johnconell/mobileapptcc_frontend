import React from 'react';
import { FlatList, Text, View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { Menu } from 'lucide-react-native';
import { useProctorDrawer } from './ProctorDrawer';
import { SessionCard } from '@/features/proctor/SessionCard';
import { useSchedules, useSessions } from '@/hooks/useRepositories';
import { useProctorStore } from '@/stores';
import { colors } from '@/theme';
import { safeBack } from '@/utils';

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
    return (
      <View style={styles.screen}>
        <Header
          title="Examination Time"
          subtitle={schedule?.name ?? 'Loading…'}
          onBack={() => safeBack(router, '/(proctor)/schedules')}
        />
        <View style={styles.list}>
          <SkeletonList rows={5} showAvatar={false} />
        </View>
      </View>
    );
  }

  const { toggleDrawer } = useProctorDrawer();

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Time"
        subtitle={schedule?.name ?? 'Select a session'}
        left={
          <Pressable onPress={toggleDrawer} style={styles.menuBtn}>
             <Menu size={24} color={colors.ink} />
          </Pressable>
        }
        onBack={() => safeBack(router, '/(proctor)/schedules')}
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
                pathname: '/(proctor)/rooms',
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
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
