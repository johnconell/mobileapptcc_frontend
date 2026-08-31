import React, { useMemo, useState } from 'react';
import { Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Users, UserRound, Menu } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { SkeletonDetail } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { useProctorDrawer } from './ProctorDrawer';
import { useRooms, useSessions } from '@/hooks/useRepositories';
import { AuthRepository, LobbyRepository } from '@/repositories';
import { QUERY_KEYS, STATUS_LABELS } from '@/constants';
import { useProctorStore } from '@/stores';
import { colors } from '@/theme';
import { safeBack } from '@/utils';
import { assertCampusWifiForJoin } from '@/services/campusWifiGate';

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

export default function RoomDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sessionId, roomId } = useLocalSearchParams<{
    sessionId: string;
    roomId: string;
  }>();
  const selectedSession = useProctorStore((s) => s.selectedSession);
  const reset = useProctorStore((s) => s.reset);
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
    const { toggleDrawer } = useProctorDrawer();

  return (
      <View style={styles.screen}>
        <Header
          title="Room"
          subtitle={session?.timeLabel ?? 'Loading…'}
          left={
            <Pressable onPress={toggleDrawer} style={styles.menuBtn}>
                <Menu size={24} color={colors.ink} />
            </Pressable>
          }
          onBack={() =>
            safeBack(router, {
              pathname: '/(proctor)/rooms',
              params: { sessionId: sessionId ?? '' },
            })
          }
        />
        <SkeletonDetail />
      </View>
    );
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
  // Only truly ended sessions show "View results & sync".
  // Do not treat canReopen===false alone as ended (idle rooms must stay openable).
  const isEnded = room.status === 'ended';

  const openOrEnter = async () => {
    console.log('RoomDetailScreen: Enter Lobby pressed', {
      sessionId,
      roomId,
      room,
      isOpen,
      isEnded,
    });

    if (!sessionId || !roomId) {
      Alert.alert('Unable to open lobby', 'Missing session or room identifier.');
      return;
    }

    const query = new URLSearchParams({
      sessionId,
      roomId,
      roomName: room.roomName,
      roomCode: room.examinationCode ?? '',
      roomStatus: room.status,
      ...(room.examSessionId != null ? { examSessionId: String(room.examSessionId) } : {}),
    }).toString();

    const targetRoute = `/lobby?${query}`;
    console.log('RoomDetailScreen: Enter Lobby pressed', {
      sessionId,
      roomId,
      roomStatus: room.status,
      roomCode: room.examinationCode,
      isOpen,
      isEnded,
      targetRoute,
    });

    // Ended: view-only — student list + Sync to Admin (no new lobby).
    if (isEnded && !isOpen) {
      console.log('RoomDetailScreen: navigating to existing ended lobby', targetRoute);
      router.push(targetRoute as any);
      return;
    }

    setBusy(true);
    try {
        // Ensure required exam data is present and up-to-date on this device.
        try {
          const { OfflineStore } = await import('@/services/offlineStore');
          const pack = await OfflineStore.getPack();
          const missing: string[] = [];
          if (!pack) {
            missing.push('Offline Exam Pack');
          } else {
            // Check question banks
            const hasQuestions = (pack.question_banks ?? []).some((b) => (b.subjects ?? []).some((s) => (s.questions ?? []).length > 0));
            if (!hasQuestions) missing.push('Question Bank');

            // Only block on critical missing data.
            const sid = session?.scheduleId ?? null;
            let scheduleExists = false;
            if (sid && String(sid).startsWith('date-')) {
              const d = String(sid).substring(5, 15);
              const t = String(sid).substring(16).replace(/-/g, ' ');
              scheduleExists = (pack.schedules ?? []).some((s) =>
                (s.exam_date || '') === d && (s.title || 'Entrance Examination') === t
              );
            } else if (sid) {
              const sidClean = String(sid).replace(/^offline-/, '');
              scheduleExists = (pack.schedules ?? []).some((s) => String(s.id) === sidClean);
            }

            if (!scheduleExists && sid) missing.push('Schedule');
          }
          if (missing.length) {
            Alert.alert(
              'System Update Required',
              `The following items are outdated or missing:\n\n• ${missing.join('\n• ')}\n\nPlease synchronize before starting the examination.`,
            );
            return;
          }
        } catch {
          // If the store read fails, fallback to network checks below.
        }

        // Validate Wi‑Fi / LAN server before changing any lobby state.
        // Explicitly set isProctor: true so student peer targets are NEVER pinged for Proctor room actions.
        const { OfflineStore } = await import('@/services/offlineStore');
        const { PeerExamClient } = await import('@/services/peerExamClient');
        await PeerExamClient.clear(); // Clear any leftover student peer target on Proctor action

        const hasPack = await OfflineStore.hasPack();
        const wifiCheck = await assertCampusWifiForJoin({ requireServer: !hasPack, isProctor: true });

        if (!wifiCheck.ok) {
          // Present a clear, actionable message and DO NOT change room state.
          Alert.alert(
            'Unable to Open Lobby',
            wifiCheck.message ?? 'This phone has no Wi‑Fi connection. Connect to the examination Wi‑Fi or enable hotspot and try again.',
          );
          return;
        }
      // Always ensureLobby so offline peer HTTP (re)starts even if the room
      // was already marked lobby_open after a previous download / app restart.
      const snapshot = await LobbyRepository.ensureLobby(sessionId, undefined, roomId);
      console.log('RoomDetailScreen: ensureLobby succeeded', snapshot);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rooms(sessionId) });
      console.log('RoomDetailScreen: navigating to lobby', targetRoute);
      router.push(targetRoute as any);
    } catch (error) {
      console.log('RoomDetailScreen: ensureLobby failed', error);
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
        right={
          <Button
            title="Logout"
            variant="ghost"
            size="sm"
            onPress={() => {
              Alert.alert('Are you sure you want to log out?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Logout',
                  style: 'destructive',
                  onPress: async () => {
                    await AuthRepository.logout();
                    reset();
                    router.replace('/');
                  },
                },
              ]);
            }}
          />
        }
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
                  {isEnded && !isOpen
                    ? 'Examination ended. You can still view the student list and sync results to Admin.'
                    : isOpen
                      ? room.status === 'lobby_open'
                        ? 'Lobby is open. Close the lobby before starting if you need to reopen this room later.'
                        : 'Examination in progress.'
                      : 'This room is closed. Open the lobby when you are ready to start.'}
                </Text>
              )}

              {room.examinationCode ? (
                <Text style={styles.code}>Code: {room.examinationCode}</Text>
              ) : null}
            </View>
          </View>
        </Card>

        <Text style={styles.help}>
          {isEnded && !isOpen
            ? 'This room cannot start a new lobby. Open results to review who took the exam and sync to Admin if you have not yet.'
            : 'Students assigned to this time slot may scan this room’s QR code. Opening the lobby marks the room as open for all connected proctors.'}
        </Text>

        <Button
          title={
            isEnded && !isOpen
              ? 'View results & sync'
              : isOpen
                ? 'Enter Lobby'
                : 'Open Lobby'
          }
          size="lg"
          fullWidth
          loading={busy}
          onPress={openOrEnter}
        />

        {room.status === 'in_progress' ? (
          <Text style={styles.examLive}>Examination in progress in this room.</Text>
        ) : null}
        {isEnded && !isOpen ? (
          <Text style={styles.examLive}>
            Session closed — view students anytime and sync when you have internet.
          </Text>
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
