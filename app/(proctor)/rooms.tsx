import React, { useEffect } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, DoorOpen, Users, UserRound } from 'lucide-react-native';
import { Card, EmptyState, Header, Loader, StatusChip } from '@/components/ui';
import { useRooms, useSessions } from '@/hooks/useRepositories';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';
import { STATUS_LABELS } from '@/constants';
import { colors } from '@/theme';
import { safeBack } from '@/utils';
import type { ExamRoom } from '@/types';

function statusLabel(status: string) {
  if (status === 'idle') return 'Closed';
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (status === 'lobby_open') return 'warning';
  if (status === 'in_progress') return 'success';
  return 'default';
}

function roomAccent(status: string) {
  if (status === 'lobby_open') return colors.warning;
  if (status === 'in_progress') return colors.success;
  return colors.inkMuted;
}

export default function RoomsScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const selectedSession = useProctorStore((s) => s.selectedSession);
  const reset = useProctorStore((s) => s.reset);
  const sessionsQuery = useSessions(selectedSession?.scheduleId);
  const roomsQuery = useRooms(sessionId, Boolean(sessionId));

  useEffect(() => {
    if (!roomsQuery.isError) return;
    const err = roomsQuery.error as { status?: number } | null;
    if (err?.status === 401 || err?.status === 403) {
      void AuthRepository.logout().then(() => {
        reset();
        router.replace('/(proctor)/login');
      });
    }
  }, [roomsQuery.isError, roomsQuery.error, reset, router]);

  const session =
    selectedSession ??
    sessionsQuery.data?.find((item) => item.id === sessionId) ??
    null;

  if (roomsQuery.isLoading) {
    return <Loader fullscreen label="Loading examination rooms…" />;
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Rooms"
        subtitle={session?.timeLabel ?? 'Select a room'}
        onBack={() =>
          safeBack(router, {
            pathname: '/(proctor)/sessions',
            params: { scheduleId: session?.scheduleId ?? '' },
          })
        }
      />
      <FlatList
        data={roomsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Select a room to view details. Opening a lobby is a separate step and is synced for
            all proctors.
          </Text>
        }
        ListEmptyComponent={<EmptyState title="No rooms found" />}
        renderItem={({ item, index }) => (
          <RoomCard
            room={item}
            delay={index * 60}
            onPress={() => {
              router.push({
                pathname: '/(proctor)/room',
                params: { sessionId: sessionId!, roomId: item.id },
              });
            }}
          />
        )}
      />
    </View>
  );
}

function RoomCard({
  room,
  onPress,
  delay = 0,
}: {
  room: ExamRoom;
  onPress: () => void;
  delay?: number;
}) {
  const accent = roomAccent(room.status);

  return (
    <Pressable onPress={onPress}>
      <Card delay={delay} style={{ ...styles.card, borderColor: accent }}>
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <View style={styles.row}>
          <View style={styles.meta}>
            <View style={styles.titleRow}>
              <DoorOpen size={18} color={accent} />
              <Text style={styles.roomName}>{room.roomName}</Text>
            </View>
            <StatusChip label={statusLabel(room.status)} tone={statusTone(room.status)} />
            <View style={styles.line}>
              <Users size={14} color={colors.primary} />
              <Text style={styles.lineText}>
                Capacity {room.capacity}
                {room.connectedCount > 0 ? ` · ${room.connectedCount} connected` : ''}
              </Text>
            </View>
            {room.proctorName ? (
              <View style={styles.line}>
                <UserRound size={14} color={colors.primary} />
                <Text style={styles.lineText}>Proctored by: {room.proctorName}</Text>
              </View>
            ) : (
              <Text style={styles.hint}>Tap for room details</Text>
            )}
          </View>
          <ChevronRight size={22} color={colors.inkMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, gap: 12, paddingBottom: 40 },
  intro: { fontSize: 14, color: colors.inkSecondary, marginBottom: 8, lineHeight: 21 },
  card: { padding: 0, overflow: 'hidden', borderWidth: 1.5 },
  accent: { height: 5, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  meta: { flex: 1, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500', flex: 1 },
  hint: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
});
