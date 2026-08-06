import React, { useEffect, useMemo } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight, DoorOpen, Users, UserRound } from 'lucide-react-native';
import { Card, EmptyState, Header, SkeletonList, StatusChip } from '@/components/ui';
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
  if (status === 'ended') return 'danger';
  return 'default';
}

function roomAccent(status: string) {
  if (status === 'lobby_open') return colors.warning;
  if (status === 'in_progress') return colors.success;
  if (status === 'ended') return colors.danger;
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

  const rooms = roomsQuery.data ?? [];
  const batchDone = useMemo(
    () => rooms.length > 0 && rooms.every((r) => r.status === 'ended'),
    [rooms],
  );
  const endedCount = rooms.filter((r) => r.status === 'ended').length;

  if (roomsQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <Header
          title="Examination Rooms"
          subtitle={session?.timeLabel ?? 'Loading…'}
          onBack={() =>
            safeBack(router, {
              pathname: '/(proctor)/sessions',
              params: { scheduleId: session?.scheduleId ?? '' },
            })
          }
        />
        <View style={styles.list}>
          <SkeletonList rows={5} showAvatar={false} />
        </View>
      </View>
    );
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
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {batchDone ? (
              <View style={styles.batchDoneBanner}>
                <CheckCircle2 size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchDoneTitle}>Batch complete</Text>
                  <Text style={styles.batchDoneBody}>
                    All rooms in this session have finished the examination.
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.intro}>
                Each room has its own random letter+number code and QR. Progress:{' '}
                {endedCount}/{rooms.length} rooms done.
              </Text>
            )}
          </View>
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
            {room.examinationCode ? (
              <Text style={styles.codeLine}>Code: {room.examinationCode}</Text>
            ) : room.status === 'ended' ? (
              <Text style={styles.hint}>Examination finished</Text>
            ) : (
              <Text style={styles.hint}>No code yet — open this room’s lobby</Text>
            )}
            {room.proctorName ? (
              <View style={styles.line}>
                <UserRound size={14} color={colors.primary} />
                <Text style={styles.lineText}>Proctored by: {room.proctorName}</Text>
              </View>
            ) : null}
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
  headerBlock: { marginBottom: 4, gap: 10 },
  intro: { fontSize: 14, color: colors.inkSecondary, lineHeight: 21 },
  batchDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  batchDoneTitle: { fontSize: 15, fontWeight: '800', color: colors.success },
  batchDoneBody: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500', marginTop: 2 },
  card: { padding: 0, overflow: 'hidden', borderWidth: 1.5 },
  accent: { height: 5, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  meta: { flex: 1, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomName: { fontSize: 17, fontWeight: '700', color: colors.ink },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500', flex: 1 },
  codeLine: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  hint: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
});
