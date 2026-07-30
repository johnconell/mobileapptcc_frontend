import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Users, UserRound } from 'lucide-react-native';
import { Button, Card, Header, Loader, StatusChip } from '@/components/ui';
import { useRooms, useSessions } from '@/hooks/useRepositories';
import { LobbyRepository } from '@/repositories';
import { QUERY_KEYS, STATUS_LABELS } from '@/constants';
import { useProctorStore } from '@/stores';
import { colors } from '@/theme';
import { safeBack } from '@/utils';

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

export default function RoomDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sessionId, roomId } = useLocalSearchParams<{
    sessionId: string;
    roomId: string;
  }>();
  const selectedSession = useProctorStore((s) => s.selectedSession);
  const sessionsQuery = useSessions(selectedSession?.scheduleId);
  const roomsQuery = useRooms(sessionId, Boolean(sessionId));
  const [busy, setBusy] = useState(false);

  const session =
    selectedSession ??
    sessionsQuery.data?.find((item) => item.id === sessionId) ??
    null;

  const room = useMemo(
    () => roomsQuery.data?.find((item) => item.id === roomId) ?? null,
    [roomsQuery.data, roomId],
  );

  if (roomsQuery.isLoading && !room) {
    return <Loader fullscreen label="Loading room…" />;
  }

  if (!room) {
    return (
      <View style={styles.screen}>
        <Header
          title="Room"
          onBack={() =>
            safeBack(router, {
              pathname: '/(proctor)/rooms',
              params: { sessionId: sessionId ?? '' },
            })
          }
        />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Room not found</Text>
          <Button
            title="Back to rooms"
            onPress={() =>
              router.replace({
                pathname: '/(proctor)/rooms',
                params: { sessionId: sessionId ?? '' },
              })
            }
          />
        </View>
      </View>
    );
  }

  const accent = roomAccent(room.status);
  const isOpen = room.status === 'lobby_open' || room.status === 'in_progress';

  const openOrEnter = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      if (!isOpen) {
        await LobbyRepository.openLobby(sessionId, undefined, roomId);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rooms(sessionId) });
      }
      router.push({
        pathname: '/(proctor)/lobby',
        params: { sessionId, roomId },
      });
    } catch (error) {
      Alert.alert(
        'Unable to open lobby',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title={room.roomName}
        subtitle={session?.timeLabel ?? 'Room details'}
        onBack={() =>
          safeBack(router, {
            pathname: '/(proctor)/rooms',
            params: { sessionId: sessionId ?? '' },
          })
        }
      />

      <View style={styles.content}>
        <Card style={{ ...styles.hero, borderColor: accent }}>
          <View style={[styles.accentBar, { backgroundColor: accent }]} />
          <View style={styles.heroBody}>
            <View style={styles.titleRow}>
              <DoorOpen size={22} color={accent} />
              <Text style={styles.roomName}>{room.roomName}</Text>
            </View>
            <StatusChip label={statusLabel(room.status)} tone={statusTone(room.status)} />

            <View style={styles.metaBlock}>
              <View style={styles.line}>
                <Users size={15} color={colors.primary} />
                <Text style={styles.lineText}>
                  Capacity {room.capacity}
                  {room.connectedCount > 0
                    ? ` · ${room.connectedCount} student${room.connectedCount === 1 ? '' : 's'} connected`
                    : ''}
                </Text>
              </View>

              {room.proctorName ? (
                <View style={styles.line}>
                  <UserRound size={15} color={colors.primary} />
                  <Text style={styles.lineText}>Proctored by: {room.proctorName}</Text>
                </View>
              ) : (
                <Text style={styles.hint}>
                  {isOpen
                    ? 'Lobby is open.'
                    : 'This room is closed. Open the lobby to generate a QR code.'}
                </Text>
              )}

              {room.examinationCode ? (
                <Text style={styles.code}>Code: {room.examinationCode}</Text>
              ) : null}
            </View>
          </View>
        </Card>

        <Text style={styles.help}>
          Students assigned to this time slot may scan this room’s QR code. Opening the lobby
          marks the room as open for all connected proctors.
        </Text>

        <Button
          title={isOpen ? 'Enter Lobby' : 'Open Lobby'}
          size="lg"
          fullWidth
          loading={busy}
          onPress={openOrEnter}
        />

        {room.status === 'in_progress' ? (
          <Text style={styles.examLive}>Examination in progress in this room.</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  hero: { padding: 0, overflow: 'hidden', borderWidth: 2 },
  accentBar: { height: 6, width: '100%' },
  heroBody: { padding: 18, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomName: { fontSize: 22, fontWeight: '800', color: colors.ink },
  metaBlock: { gap: 10, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 14, color: colors.inkSecondary, fontWeight: '600', flex: 1 },
  hint: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  code: { fontSize: 14, fontWeight: '700', color: colors.ink, letterSpacing: 0.4 },
  help: { fontSize: 13, color: colors.inkSecondary, lineHeight: 20 },
  examLive: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.success,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
