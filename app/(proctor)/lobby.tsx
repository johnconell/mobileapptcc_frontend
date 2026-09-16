import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, StyleSheet, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useKeepAwake } from 'expo-keep-awake';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { ConfirmationModal } from '@/shared/components/ui/Dialog';
import { Header } from '@/shared/components/ui/Header';
import { QrCodePanel } from '@/shared/components/ui/QrCodePanel';
import {
  Skeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonText,
} from '@/shared/components/ui/Skeleton';
import { StatusChip } from '@/shared/components/ui/StatusChip';
import { StatisticCard } from '@/shared/components/ui/StatisticCard';
import { LobbyStudentCard } from '@/features/lobby/components/LobbyStudentCard';
import { useLobby } from '@/features/lobby/hooks/useLobby';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QUERY_KEYS } from '@/shared/constants';
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { startProctorHostIpSync } from '@/features/monitoring/services/proctorHostIpSync';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { colors } from '@/shared/theme';
import type { LobbyStudent } from '@/shared/types';
import { safeBack } from '@/shared/utils';
import { confirmProctorLogout } from '@/features/authentication/utils/confirmProctorLogout';
import {
  // keep existing imports below — do not break the rest of this file
  Copy,
  Users,
  UserCheck,
  UserX,
  Play,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  LogOut,
  ArrowDownUp,
  ArrowLeft,
  RefreshCw,
  Check,
  Share2,
  Wifi,
  Search,
  Bell,
  X,
  ChevronRight,
  Keyboard,
} from 'lucide-react-native';

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRemaining(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function liveRemainingSeconds(lobby: {
  status?: string;
  remainingSeconds?: number | null;
  session?: {
    startedAt?: string | null;
    durationMinutes?: number | null;
    remainingSeconds?: number | null;
  } | null;
}): number | null {
  if (lobby.status !== 'in_progress') {
    return lobby.session?.remainingSeconds ?? lobby.remainingSeconds ?? null;
  }
  const startedAt = lobby.session?.startedAt;
  const durationMinutes = lobby.session?.durationMinutes;
  if (startedAt && durationMinutes && durationMinutes > 0) {
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
    return Math.max(0, Math.round(durationMinutes * 60 - elapsed));
  }
  return lobby.session?.remainingSeconds ?? lobby.remainingSeconds ?? null;
}

export default function ProctorLobbyScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors: themeColors, isDark } = useAppTheme();
  const { sessionId, roomId, examSessionId, scheduleId } = useLocalSearchParams<{
    sessionId: string;
    roomId?: string;
    examSessionId?: string;
    scheduleId?: string;
  }>();
  const profile = useProctorStore((s) => s.profile);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const storeLobby = useLobbyStore((s) => s.snapshot);
  const selectedSchedule = useProctorStore((s) => s.selectedSchedule);
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<LobbyStudent | null>(null);
  const [syncPending, setSyncPending] = useState<number | null>(null);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const knownStudentIds = useRef<Set<string>>(new Set());
  const knownStudentMeta = useRef<Map<string, LobbyStudent>>(new Map());
  const knownStudentStatus = useRef<Map<string, LobbyStudent['status']>>(new Map());
  const checkInReady = useRef(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; at: string; kind: 'connect' | 'disconnect' }>
  >([]);
  const [clockTick, setClockTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [reconnectCode, setReconnectCode] = useState<string | null>(null);
  const [reconnectExpiresAt, setReconnectExpiresAt] = useState<string | null>(null);
  const [peerHost, setPeerHost] = useState<string | null>(null);
  const [hosting, setHosting] = useState(PeerExamServer.info());
  const [serverLastHeartbeat, setServerLastHeartbeat] = useState<number>(Date.now());

  // REPLICATION STATES: SWAP MODAL ('Switch Active Room') & SEND MODAL ('Room Access Code')
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [keypadCode, setKeypadCode] = useState('');
  const [availableRooms, setAvailableRooms] = useState<
    Array<{ id: number; name: string; capacity: number }>
  >([]);
  const [targetRoomId, setTargetRoomId] = useState<number | null>(null);

  const handleKeypadPress = (digit: string) => {
    if (keypadCode.length < 6) {
      setKeypadCode((prev) => prev + digit);
    }
  };

  const handleKeypadBackspace = () => {
    setKeypadCode((prev) => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setKeypadCode('');
  };

  const handleKeypadRandom = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
    setKeypadCode(randomCode);
  };

  const handleApplyCustomCode = () => {
    if (keypadCode.length < 4) {
      Alert.alert('Invalid Code', 'Please enter at least a 4-digit code.');
      return;
    }
    if (storeLobby) {
      setSnapshot({
        ...storeLobby,
        examinationCode: keypadCode,
      });
      setCodeModalVisible(false);
      Alert.alert('Access Code Updated', `Room Access Code set to ${keypadCode}`);
    }
  };

  const handleConfirmRoomSwitch = () => {
    if (!targetRoomId) return;
    const targetRoom = availableRooms.find((r) => r.id === targetRoomId);
    if (!targetRoom) return;

    setSwapModalVisible(false);
    const queryParams: Record<string, string> = {
      sessionId: String(sessionId),
      roomId: String(targetRoom.id),
      roomName: targetRoom.name,
      scheduleId: String(scheduleId || ''),
    };
    router.replace(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
  };

  const handleShareCode = async () => {
    if (!storeLobby?.examinationCode) return;
    try {
      await Share.share({
        message: `Examination Access Code: ${storeLobby.examinationCode}\nRoom: ${storeLobby.session?.roomName || 'Exam Room'}\nConnect to Wi-Fi: ${storeLobby.wifiSsid || 'Testing Wi-Fi'}`,
      });
    } catch {
      // ignore
    }
  };

  const lobbyQuery = useLobby(
    ready && !openError ? sessionId : undefined,
    roomId,
  );

  const pushNotification = (
    kind: 'connect' | 'disconnect',
    title: string,
    body: string,
  ) => {
    const at = new Date().toISOString();
    setNotifications((prev) =>
      [{ id: `${kind}-${at}-${Math.random().toString(36).slice(2, 7)}`, title, body, at, kind }, ...prev].slice(
        0,
        40,
      ),
    );
    Alert.alert(title, body);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) return;
      setOpenError(null);
      setReady(false);
      setSnapshot(null);
      knownStudentIds.current = new Set();
      checkInReady.current = false;
      try {
        // Resume a peer session that survived an app kill, then load the lobby.
        await PeerExamServer.restore();
        let snapshot = await LobbyRepository.fetchProctorLobby(
          sessionId,
          roomId,
          examSessionId,
        );
        if (cancelled) return;
        if (!snapshot) {
          const { OfflineStore } = await import('@/features/synchronization/services/offlineStore');
          if (await OfflineStore.hasPack()) {
            try {
              snapshot = await LobbyRepository.ensureLobby(sessionId, undefined, roomId);
            } catch {
              // ignore
            }
          }
        }
        if (!snapshot) {
          setOpenError(
            'This room lobby is not available. Go back and open the lobby, or view results if the exam already ended.',
          );
          return;
        }
        knownStudentIds.current = new Set(snapshot.students.map((s) => s.id));
        knownStudentMeta.current = new Map(snapshot.students.map((s) => [s.id, s]));
        knownStudentStatus.current = new Map(
          snapshot.students.map((s) => [s.id, s.status]),
        );
        checkInReady.current = true;
        setSnapshot(snapshot);
        setPeerHost(PeerExamServer.info().host);

        try {
          const pack = await OfflineStore.getPack();
          const roomsList: Array<{ id: number; name: string; capacity: number }> = [];
          (pack?.schedules ?? []).forEach((s) => {
            (s.rooms ?? []).forEach((r) => {
              if (!roomsList.some((ex) => ex.id === r.id)) {
                roomsList.push({
                  id: r.id,
                  name: r.room_name || `Room ${r.id}`,
                  capacity: r.capacity ?? 60,
                });
              }
            });
          });
          if (roomsList.length === 0) {
            roomsList.push(
              { id: 101, name: 'Room 101 · Testing Lab A', capacity: 60 },
              { id: 102, name: 'Room 102 · Testing Lab B', capacity: 50 },
              { id: 103, name: 'Room 103 · Multimedia Hall', capacity: 80 },
            );
          }
          setAvailableRooms(roomsList);
          if (roomId) {
            setTargetRoomId(Number(roomId));
          } else if (roomsList.length > 0) {
            setTargetRoomId(roomsList[0].id);
          }
        } catch {
          // ignore
        }

        await queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.lobby(sessionId, roomId),
        });
      } catch (error) {
        if (cancelled) return;
        setOpenError(
          error instanceof Error ? error.message : 'Unable to load examination lobby.',
        );
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, roomId, examSessionId, setSnapshot, queryClient]);

  // Peer mode: push updates to UI, but throttled to prevent JS thread lockup during high-traffic heartbeats.
  useEffect(() => {
    let lastRefresh = 0;
    return PeerExamServer.subscribe(() => {
      const now = Date.now();
      setPeerHost(PeerExamServer.info().host);
      setServerLastHeartbeat(now);

      // Only trigger a full UI query invalidation at most once every 3 seconds.
      if (now - lastRefresh > 3000) {
        lastRefresh = now;
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.lobby(sessionId, roomId),
        });
      }
    });
  }, [queryClient, sessionId, roomId]);

  useEffect(() => {
    if (lobbyQuery.data) {
      setSnapshot(lobbyQuery.data);
      if (selected) {
        const latest = lobbyQuery.data.students.find((s) => s.id === selected.id) ?? null;
        setSelected(latest);
        if (latest?.status === 'disconnected') {
          setReconnectCode(latest.reconnectCode ?? null);
          setReconnectExpiresAt(latest.reconnectCodeExpiresAt ?? null);
        } else {
          setReconnectCode(null);
          setReconnectExpiresAt(null);
        }
      }

      // Real-time connect / disconnect notifications (LAN poll — no internet required).
      if (checkInReady.current) {
        const currentIds = new Set(lobbyQuery.data.students.map((s) => s.id));

        const newcomers = lobbyQuery.data.students.filter(
          (s) => !knownStudentIds.current.has(s.id),
        );
        newcomers.forEach((student) => {
          knownStudentIds.current.add(student.id);
          knownStudentMeta.current.set(student.id, student);
          knownStudentStatus.current.set(student.id, student.status);
          const timeLabel = formatTime(student.joinedAt || new Date().toISOString());
          const statusLabel =
            student.status === 'waiting'
              ? 'Waiting'
              : student.status === 'connected'
                ? 'Connected'
                : student.status === 'taking_exam'
                  ? 'Taking'
                  : student.status === 'disconnected'
                    ? 'Disconnected'
                    : student.status === 'finished'
                      ? 'Done'
                      : student.status.replace(/_/g, ' ');
          pushNotification(
            'connect',
            'Student Connected',
            `${student.fullName} connected to the examination system at ${timeLabel}. Status: ${statusLabel}.`,
          );
        });

        const leftIds = [...knownStudentIds.current].filter((id) => !currentIds.has(id));
        leftIds.forEach((id) => {
          const prev = knownStudentMeta.current.get(id);
          knownStudentIds.current.delete(id);
          knownStudentMeta.current.delete(id);
          knownStudentStatus.current.delete(id);
          const name = prev?.fullName || 'A student';
          const timeLabel = formatTime(new Date().toISOString());
          pushNotification(
            'disconnect',
            'Student Disconnected',
            `${name} left the examination lobby at ${timeLabel}.`,
          );
        });

        lobbyQuery.data.students.forEach((s) => {
          const prevStatus = knownStudentStatus.current.get(s.id);
          if (
            prevStatus &&
            prevStatus !== 'disconnected' &&
            s.status === 'disconnected'
          ) {
            const timeLabel = formatTime(new Date().toISOString());
            pushNotification(
              'disconnect',
              'Student Disconnected',
              `${s.fullName} lost Wi‑Fi or stopped heartbeating at ${timeLabel}. Issue a reconnect code if the reason is valid.`,
            );
          }
          if (
            prevStatus === 'disconnected' &&
            s.status === 'taking_exam'
          ) {
            pushNotification(
              'connect',
              'Student Reconnected',
              `${s.fullName} reconnected and is taking the examination again.`,
            );
          }
          knownStudentIds.current.add(s.id);
          knownStudentMeta.current.set(s.id, s);
          knownStudentStatus.current.set(s.id, s.status);
        });
      } else if (lobbyQuery.data.students.length) {
        lobbyQuery.data.students.forEach((s) => {
          knownStudentIds.current.add(s.id);
          knownStudentMeta.current.set(s.id, s);
          knownStudentStatus.current.set(s.id, s.status);
        });
      }
    }
  }, [lobbyQuery.data, setSnapshot, selected]);

  const lobby = lobbyQuery.data ?? storeLobby;

  // Detect Wi‑Fi / DHCP changes: refresh local peer QR host IP and push to Laravel.
  useEffect(() => {
    const cloudSessionId =
      lobby?.session?.examSessionId ??
      (examSessionId ? Number(examSessionId) : null);
    if (!peerHost && !cloudSessionId) return;

    return startProctorHostIpSync({
      examSessionId:
        cloudSessionId && Number.isFinite(cloudSessionId) ? cloudSessionId : null,
      onHostChanged: (host) => {
        setPeerHost(host);
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.lobby(sessionId, roomId),
        });
      },
    });
  }, [
    peerHost,
    lobby?.session?.examSessionId,
    examSessionId,
    queryClient,
    sessionId,
    roomId,
  ]);

  // Live countdown tick while the examination is running.
  useEffect(() => {
    if (lobby?.status !== 'in_progress') return;
    const id = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [lobby?.status]);

  const remainingLive = lobby ? liveRemainingSeconds(lobby) : null;
  void clockTick; // re-render dependency for remainingLive

  useEffect(() => {
    if (!lobby?.status || lobby.status !== 'ended') return;
    const examSessionId = lobby.session?.examSessionId;
    if (!examSessionId) return;
    let cancelled = false;
    void LobbyRepository.syncPendingCount(examSessionId)
      .then((info) => {
        if (cancelled) return;
        setSyncPending(info.pending);
        setSyncConfigured(info.configured);
      })
      .catch(() => {
        if (!cancelled) setSyncPending(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lobby?.status, lobby?.session?.examSessionId, lobby?.finishedCount]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(proctor)/(tabs)/examination');
  };

  if (!ready) {
    return (
      <View style={[styles.screen, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <View style={[styles.navBar, { backgroundColor: themeColors.background }]}>
          <View style={styles.navLeftRow}>
            <Pressable
              style={[styles.navIconBtn, { backgroundColor: isDark ? '#1A1A1A' : themeColors.card, borderColor: themeColors.cardBorder }]}
              onPress={goBack}
              hitSlop={8}
            >
              <ArrowLeft size={18} color={themeColors.textPrimary} />
            </Pressable>
            <View style={[styles.navAvatarCircle, { backgroundColor: isDark ? '#1E1E1E' : themeColors.cardMuted, borderColor: themeColors.cardBorder }]}>
              <Text style={[styles.navAvatarText, { color: themeColors.textPrimary }]}>
                {profile?.displayName
                  ? profile.displayName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'P1'}
              </Text>
            </View>
          </View>
          <View style={styles.navCenterBlock}>
            <Text style={[styles.navTitleText, { color: themeColors.textPrimary }]} numberOfLines={1}>
              Examination Lobby
            </Text>
            <Text style={[styles.navSubtitleText, { color: themeColors.textSecondary }]} numberOfLines={1}>
              Connecting to peer server…
            </Text>
          </View>
          <View style={styles.navRightRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Logout"
              style={[styles.navIconBtn, { backgroundColor: isDark ? '#1A1A1A' : themeColors.card, borderColor: themeColors.cardBorder }]}
              onPress={() => confirmProctorLogout()}
              hitSlop={8}
            >
              <LogOut size={18} color="#7A1F2B" />
            </Pressable>
          </View>
        </View>
        <View style={styles.lobbySkeleton}>
          <SkeletonCard>
            <Skeleton height={16} width="50%" />
            <SkeletonText lines={2} />
            <Skeleton height={180} radius={16} />
          </SkeletonCard>
          <SkeletonList rows={4} />
        </View>
      </View>
    );
  }

  if (openError || !lobby) {
    return (
      <View style={[styles.screen, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <View style={[styles.navBar, { backgroundColor: themeColors.background }]}>
          <View style={styles.navLeftRow}>
            <Pressable
              style={[styles.navIconBtn, { backgroundColor: isDark ? '#1A1A1A' : themeColors.card, borderColor: themeColors.cardBorder }]}
              onPress={goBack}
              hitSlop={8}
            >
              <ArrowLeft size={18} color={themeColors.textPrimary} />
            </Pressable>
            <View style={[styles.navAvatarCircle, { backgroundColor: isDark ? '#1E1E1E' : themeColors.cardMuted, borderColor: themeColors.cardBorder }]}>
              <Text style={[styles.navAvatarText, { color: themeColors.textPrimary }]}>
                {profile?.displayName
                  ? profile.displayName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'P1'}
              </Text>
            </View>
          </View>
          <View style={styles.navCenterBlock}>
            <Text style={[styles.navTitleText, { color: themeColors.textPrimary }]} numberOfLines={1}>
              Examination Lobby
            </Text>
          </View>
          <View style={styles.navRightRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Logout"
              style={[styles.navIconBtn, { backgroundColor: isDark ? '#1A1A1A' : themeColors.card, borderColor: themeColors.cardBorder }]}
              onPress={() => confirmProctorLogout()}
              hitSlop={8}
            >
              <LogOut size={18} color="#7A1F2B" />
            </Pressable>
          </View>
        </View>

        <View style={styles.errorWrap}>
          <Text style={[styles.errorTitle, { color: themeColors.textPrimary }]}>Lobby not available</Text>
          <Text style={[styles.errorBody, { color: themeColors.textSecondary }]}>
            {openError || 'No examination session is available for this room.'}
          </Text>
          <Button
            title="Back to examination schedules"
            fullWidth
            onPress={goBack}
            style={{ backgroundColor: colors.primary }}
          />
        </View>
      </View>
    );
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.lobby(sessionId, roomId),
    });
  };

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(lobby.examinationCode ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert('Examination Code', lobby.examinationCode ?? '');
    }
  };

  const scheduleLabel =
    lobby.schedule?.name ||
    selectedSchedule?.name ||
    'Examination Schedule';
  const roomLabel = lobby.session?.roomName || lobby.roomName || 'Room 01';
  const rawBatch = lobby.session?.batchNumber || '1';
  const batchLabel = String(rawBatch).toLowerCase().startsWith('batch')
    ? String(rawBatch)
    : `Batch ${rawBatch}`;

  return (
    <View style={[styles.screen, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
      {/* 1. UNIFORM HEADER NAV BAR (Avatar Left, Title Center, Logout Right) */}
      <View style={[styles.navBar, { backgroundColor: themeColors.background }]}>
        <View style={styles.navLeftRow}>
          <Pressable
            style={[styles.navIconBtn, { backgroundColor: isDark ? '#1A1A1A' : themeColors.card, borderColor: themeColors.cardBorder }]}
            onPress={goBack}
            hitSlop={8}
          >
            <ArrowLeft size={18} color={themeColors.textPrimary} />
          </Pressable>
          <View style={[styles.navAvatarCircle, { backgroundColor: isDark ? '#1E1E1E' : themeColors.cardMuted, borderColor: themeColors.cardBorder }]}>
            <Text style={[styles.navAvatarText, { color: themeColors.textPrimary }]}>
              {profile?.displayName
                ? profile.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'P1'}
            </Text>
          </View>
        </View>

        <View style={styles.navCenterBlock}>
          <Text style={[styles.navTitleText, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {scheduleLabel}
          </Text>
          <Text style={[styles.navSubtitleText, { color: themeColors.textSecondary }]} numberOfLines={1}>
            {roomLabel} · {batchLabel} · {lobby.registeredCount || lobby.students.length} Candidates
          </Text>
        </View>

        <View style={styles.navRightRow}>
          <Pressable
            accessibilityRole="button"
            style={[styles.navIconBtn, { backgroundColor: isDark ? '#1A1A1A' : themeColors.card, borderColor: themeColors.cardBorder }]}
            onPress={() => confirmProctorLogout()}
            accessibilityLabel="Logout"
            hitSlop={8}
          >
            <LogOut size={18} color="#7A1F2B" />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={lobby.students}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* ============================================================= */}
            {/* EXAMINATION ACCESS PASS CARD (Theme-aware, matching results) */}
            {/* Soft ivory in light mode, elevated dark in dark mode          */}
            {/* ============================================================= */}
            <View
              style={[
                styles.accessPassCard,
                {
                  backgroundColor: themeColors.card,
                  borderColor: themeColors.cardBorder,
                },
              ]}
            >
              {/* Top Banner Row */}
              <View style={styles.depositTopRow}>
                <View
                  style={[
                    styles.depositTagBadge,
                    {
                      backgroundColor: isDark ? '#2A1414' : themeColors.accentMuted,
                      borderColor: isDark ? '#7A1F2B50' : '#FECACA',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.depositTagText,
                      { color: isDark ? '#E8342A' : '#7A1F2B' },
                    ]}
                  >
                    EXAMINATION ACCESS PASS
                  </Text>
                </View>

                <View
                  style={[
                    styles.depositLiveBadge,
                    {
                      backgroundColor: isDark ? '#142918' : '#DCFCE7',
                      borderColor: isDark ? '#22C55E40' : '#86EFAC',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.depositLiveDot,
                      { backgroundColor: isDark ? '#22C55E' : '#16A34A' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.depositLiveText,
                      { color: isDark ? '#4ADE80' : '#15803D' },
                    ]}
                  >
                    {lobby.status === 'in_progress' ? 'EXAM IN PROGRESS' : 'LAN BROADCAST ACTIVE'}
                  </Text>
                </View>
              </View>

              {/* Centered QR Code on White Inset Box */}
              <View
                style={[
                  styles.qrWhiteFrame,
                  {
                    borderColor: isDark ? '#262626' : themeColors.cardBorder,
                  },
                ]}
              >
                <QrCodePanel
                  value={lobby.qrValue}
                  size={190}
                  note={
                    lobby.status === 'in_progress'
                      ? 'Exam in progress · New scans locked'
                      : peerHost
                        ? `Connect to ${lobby.wifiSsid || 'Exam Wi-Fi'} & scan`
                        : 'Scan QR with examinee device to enter'
                  }
                />
              </View>

              {/* Bold Hero Code Display */}
              <View style={styles.heroCodeSection}>
                <Text style={[styles.heroCodeLabel, { color: themeColors.textMuted }]}>
                  EXAMINATION ROOM ACCESS CODE
                </Text>
                <View style={styles.heroCodeRow}>
                  <Text
                    style={[
                      styles.heroCodeValue,
                      { color: isDark ? '#FFFFFF' : '#7A1F2B' },
                    ]}
                  >
                    {lobby.examinationCode || '----'}
                  </Text>
                  <View style={styles.codeActionButtonsRow}>
                    <Pressable
                      style={[
                        styles.codeSquareBtn,
                        {
                          backgroundColor: isDark ? '#1E1E1E' : themeColors.cardMuted,
                          borderColor: isDark ? '#2E2E2E' : themeColors.cardBorder,
                        },
                      ]}
                      onPress={copyCode}
                      accessibilityLabel="Copy Code"
                      hitSlop={6}
                    >
                      {copied ? (
                        <Check size={18} color={isDark ? '#22C55E' : '#16A34A'} />
                      ) : (
                        <Copy size={18} color={isDark ? '#FFFFFF' : '#7A1F2B'} />
                      )}
                    </Pressable>
                    <Pressable
                      style={[
                        styles.codeSquareBtn,
                        {
                          backgroundColor: isDark ? '#1E1E1E' : themeColors.cardMuted,
                          borderColor: isDark ? '#2E2E2E' : themeColors.cardBorder,
                        },
                      ]}
                      onPress={handleShareCode}
                      accessibilityLabel="Share Code"
                      hitSlop={6}
                    >
                      <Share2 size={18} color={isDark ? '#FFFFFF' : '#7A1F2B'} />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Data Detail Rows */}
              <View
                style={[
                  styles.depositDetailsTable,
                  {
                    backgroundColor: isDark ? '#1A1A1A' : themeColors.cardMuted,
                    borderColor: isDark ? '#262626' : themeColors.cardBorder,
                  },
                ]}
              >
                <View style={styles.depositDetailRow}>
                  <Text style={[styles.depositDetailLabel, { color: isDark ? '#A1A1AA' : themeColors.textSecondary }]}>Schedule</Text>
                  <Text style={[styles.depositDetailVal, { color: isDark ? '#FFFFFF' : themeColors.textPrimary }]}>
                    {scheduleLabel}
                  </Text>
                </View>
                <View style={[styles.depositDetailDivider, { backgroundColor: isDark ? '#262626' : themeColors.cardBorder }]} />

                <View style={styles.depositDetailRow}>
                  <Text style={[styles.depositDetailLabel, { color: isDark ? '#A1A1AA' : themeColors.textSecondary }]}>Room & Venue</Text>
                  <Text style={[styles.depositDetailVal, { color: isDark ? '#FFFFFF' : themeColors.textPrimary }]}>
                    {roomLabel}
                  </Text>
                </View>
                <View style={[styles.depositDetailDivider, { backgroundColor: isDark ? '#262626' : themeColors.cardBorder }]} />

                <View style={styles.depositDetailRow}>
                  <Text style={[styles.depositDetailLabel, { color: isDark ? '#A1A1AA' : themeColors.textSecondary }]}>Batch Number</Text>
                  <Text style={[styles.depositDetailVal, { color: isDark ? '#FFFFFF' : themeColors.textPrimary }]}>
                    {batchLabel}
                  </Text>
                </View>
                <View style={[styles.depositDetailDivider, { backgroundColor: isDark ? '#262626' : themeColors.cardBorder }]} />

                <View style={styles.depositDetailRow}>
                  <Text style={[styles.depositDetailLabel, { color: isDark ? '#A1A1AA' : themeColors.textSecondary }]}>LAN Server Host</Text>
                  <Text style={[styles.depositDetailVal, { color: isDark ? '#FFFFFF' : themeColors.textPrimary }]}>
                    {peerHost ? `${peerHost}:${hosting.port}` : 'Local P2P Broadcast'}
                  </Text>
                </View>
                <View style={[styles.depositDetailDivider, { backgroundColor: isDark ? '#262626' : themeColors.cardBorder }]} />

                <View style={styles.depositDetailRow}>
                  <Text style={[styles.depositDetailLabel, { color: isDark ? '#A1A1AA' : themeColors.textSecondary }]}>Wi-Fi Network</Text>
                  <Text style={[styles.depositDetailVal, { color: isDark ? '#FFFFFF' : themeColors.textPrimary }]}>
                    {lobby.wifiSsid || 'Testing Wi-Fi'}
                  </Text>
                </View>
                <View style={[styles.depositDetailDivider, { backgroundColor: isDark ? '#262626' : themeColors.cardBorder }]} />

                <View style={styles.depositDetailRow}>
                  <Text style={[styles.depositDetailLabel, { color: isDark ? '#A1A1AA' : themeColors.textSecondary }]}>Registered Examinees</Text>
                  <Text style={[styles.depositDetailVal, { color: isDark ? '#FFFFFF' : themeColors.textPrimary }]}>
                    {lobby.registeredCount || lobby.students.length} Candidates
                  </Text>
                </View>
              </View>

              {/* Primary Card Buttons */}
              <View style={styles.depositActionsRow}>
                <Button
                  title="Regenerate QR"
                  variant="outline"
                  loading={busy}
                  disabled={lobby.can_control === false || lobby.status === 'ended' || lobby.status === 'in_progress'}
                  onPress={async () => {
                    if (!sessionId) return;
                    if (lobby.can_control === false) {
                      Alert.alert(
                        'Not allowed',
                        'Only the proctor who opened this lobby can regenerate the code.',
                      );
                      return;
                    }
                    setBusy(true);
                    try {
                      const snapshot = await LobbyRepository.regenerateQr(sessionId, roomId);
                      setSnapshot(snapshot);
                      await refresh();
                    } catch (error) {
                      Alert.alert(
                        'Unable to regenerate',
                        error instanceof Error ? error.message : 'Please try again.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={[
                    styles.depositOutlineBtn,
                    {
                      borderColor: isDark ? '#333333' : themeColors.cardBorder,
                      backgroundColor: isDark ? '#1A1A1A' : themeColors.card,
                    },
                  ]}
                />

                <Button
                  title={
                    lobby.status === 'in_progress'
                      ? 'End Examination'
                      : lobby.status === 'ended'
                        ? 'Session Ended'
                        : 'Start Examination'
                  }
                  variant="primary"
                  loading={busy}
                  disabled={lobby.can_control === false || lobby.status === 'ended'}
                  onPress={() => {
                    if (lobby.can_control === false) {
                      Alert.alert('Not allowed', 'Only the proctor who opened this lobby can control it.');
                      return;
                    }
                    if (lobby.status === 'in_progress') {
                      setEndOpen(true);
                    } else {
                      setStartOpen(true);
                    }
                  }}
                  style={[
                    styles.depositSolidBtn,
                    { backgroundColor: '#7A1F2B' },
                  ]}
                />
              </View>
            </View>

            {lobby.status === 'ended' ? (
              <View style={{ gap: 10, marginTop: 12 }}>
                <Button
                  title={
                    syncPending != null && syncPending > 0
                      ? `Sync results to Admin (${syncPending})`
                      : syncPending === 0
                        ? 'Results synced to Admin'
                        : 'Sync results to Admin'
                  }
                  size="lg"
                  fullWidth
                  loading={busy}
                  disabled={busy || syncPending === 0}
                  onPress={async () => {
                    const examSessionId = lobby.session?.examSessionId || lobby.session?.id;
                    if (!examSessionId) {
                      Alert.alert('Unable to sync', 'No local or remote session identifier found.');
                      return;
                    }
                    setBusy(true);
                    try {
                      const result = await LobbyRepository.syncToAdmin(examSessionId);
                      const info = await LobbyRepository.syncPendingCount(examSessionId);
                      setSyncPending(info.pending);
                      setSyncConfigured(info.configured);
                      Alert.alert(
                        result.failed > 0 ? 'Sync partially complete' : 'Synced',
                        result.message,
                      );
                    } catch (error) {
                      Alert.alert(
                        'Sync failed',
                        error instanceof Error
                          ? error.message
                          : 'Connect to the internet and try again.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={{ backgroundColor: colors.primary }}
                />
                {syncConfigured === false ? (
                  <Text style={styles.ownerHint}>
                    Set ADMIN_SYNC_URL and ADMIN_SYNC_TOKEN on the LAN server, then restart Laravel.
                  </Text>
                ) : (
                  <Text style={styles.ownerHint}>
                    You can leave and return later via View results & sync if you forget to sync now.
                  </Text>
                )}
                {lobby.can_control === false && (
                  <Text style={styles.ownerHint}>
                    Viewing only — opened by {lobby.proctor_name || 'another proctor'}.
                  </Text>
                )}
              </View>
            ) : null}

            {lobby.status === 'ended' ? (
              <Card style={styles.endedBanner}>
                <CheckCircle2 size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.endedTitle}>Examination ended</Text>
                  <Text style={styles.endedBody}>
                    This session is closed
                    {lobby.endedAt ? ` · ${formatTime(lobby.endedAt)}` : ''}
                    . Sync results to Admin when you are back online.
                  </Text>
                </View>
              </Card>
            ) : null}

            {lobby.status === 'in_progress' ? (
              <Card>
                <Text style={[styles.monitorTitle, { color: themeColors.textPrimary }]}>Live monitoring</Text>
                <Text style={styles.monitorTimer}>
                  {formatRemaining(remainingLive)}
                </Text>
                <Text style={[styles.monitorLine, { color: themeColors.textSecondary }]}>Remaining time</Text>
                <Text style={[styles.monitorLine, { color: themeColors.textSecondary }]}>
                  Taking: {lobby.takingCount} · Disconnected:{' '}
                  {lobby.disconnectedCount ?? 0} · Done: {lobby.finishedCount}
                </Text>
              </Card>
            ) : null}

            <Text style={[styles.section, { color: themeColors.textMuted }]}>Security Monitoring</Text>
            <Text style={[styles.sectionHint, { color: themeColors.textSecondary }]}>
              {lobby.registeredCount || lobby.students.length} Candidates registered · Live examinee integrity
            </Text>
            <View style={styles.statsGrid}>
              <StatisticCard
                label="In Lobby"
                value={lobby.waitingCount}
                hint="Waiting to start"
                tone="warning"
                icon={<UserCheck size={18} color={themeColors.warning} />}
                compact
              />
              <StatisticCard
                label="Taking Exam"
                value={lobby.takingCount}
                hint="Actively answering"
                tone="default"
                icon={<Play size={18} color={themeColors.accent} />}
                compact
                delay={20}
              />
              <StatisticCard
                label="Completed"
                value={lobby.finishedCount}
                hint="Exam submitted"
                tone="success"
                icon={<CheckCircle2 size={18} color={themeColors.success} />}
                compact
                delay={40}
              />
              <StatisticCard
                label="Disconnected / Alerts"
                value={`${lobby.disconnectedCount ?? 0}${lobby.violationsDetected ? ` (${lobby.violationsDetected}!)` : ''}`}
                hint={lobby.violationsDetected ? `${lobby.violationsDetected} security flags` : 'Network integrity'}
                tone={(lobby.disconnectedCount ?? 0) > 0 || lobby.violationsDetected > 0 ? 'warning' : 'info'}
                icon={<ShieldAlert size={18} color={lobby.violationsDetected > 0 ? themeColors.danger : themeColors.warning} />}
                compact
                delay={60}
              />
            </View>

            <Text style={[styles.section, { color: themeColors.textMuted }]}>Students in this room</Text>
            <Text style={[styles.sectionHint, { color: themeColors.textSecondary }]}>
              {lobby.waitingCount} waiting to start · {lobby.takingCount} taking ·{' '}
              {lobby.connectedCount} joined of {lobby.registeredCount} registered. Tap a student
              for details. Disconnected students show a 6-digit reconnect PIN (not the exam code).
            </Text>

            {(lobby.recentViolations?.length ?? 0) > 0 ? (
              <Card>
                <Text style={[styles.historyTitle, { color: themeColors.textPrimary }]}>Security violations</Text>
                {(lobby.recentViolations ?? []).slice(0, 8).map((v) => (
                  <View key={String(v.id)} style={[styles.historyRow, { borderBottomColor: themeColors.cardBorder }]}>
                    <Text style={[styles.historyKind, styles.historyDisconnect]}>
                      {String(v.type).replace(/_/g, ' ')}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyBody, { color: themeColors.textPrimary }]}>
                        {v.studentName}: {v.message || v.type}
                      </Text>
                      <Text style={[styles.historyTime, { color: themeColors.textMuted }]}>
                        {formatTime(v.occurredAt)} · warning #{v.violationCount}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            <Button
              title={
                showHistory
                  ? 'Hide connection history'
                  : `Connection history (${notifications.length})`
              }
              variant="ghost"
              fullWidth
              onPress={() => setShowHistory((v) => !v)}
            />
            {showHistory ? (
              <Card>
                <Text style={[styles.historyTitle, { color: themeColors.textPrimary }]}>Live connection log</Text>
                {notifications.length === 0 ? (
                  <Text style={[styles.historyEmpty, { color: themeColors.textMuted }]}>No connection events yet.</Text>
                ) : (
                  notifications.slice(0, 12).map((n) => (
                    <View key={n.id} style={[styles.historyRow, { borderBottomColor: themeColors.cardBorder }]}>
                      <Text
                        style={[
                          styles.historyKind,
                          n.kind === 'disconnect' ? styles.historyDisconnect : null,
                        ]}
                      >
                        {n.kind === 'connect' ? 'Connected' : 'Left'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyBody, { color: themeColors.textPrimary }]}>{n.body}</Text>
                        <Text style={[styles.historyTime, { color: themeColors.textMuted }]}>{formatTime(n.at)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <LobbyStudentCard
            student={item}
            delay={Math.min(index * 40, 200)}
            onPress={() => {
              setSelected(item);
              setReconnectCode(item.reconnectCode ?? null);
              setReconnectExpiresAt(item.reconnectCodeExpiresAt ?? null);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>
            No students have joined yet. Share the QR Code or exam code.
          </Text>
        }
      />

      <ConfirmationModal
        visible={startOpen}
        title="Start Examination?"
        description="Students who already scanned the QR and selected their name (Waiting) will move to Taking. Exam Security Mode activates on student devices. New QR scans will be blocked."
        confirmLabel="Yes, start"
        cancelLabel="No"
        loading={busy}
        onCancel={() => setStartOpen(false)}
        onConfirm={async () => {
          if (!sessionId) return;
          // Validate required data and LAN connectivity before starting the exam.
          try {
            const { OfflineStore } = await import('@/features/synchronization/services/offlineStore');
            const todayCheck = await OfflineStore.isPackDownloadedToday();
            if (!todayCheck.downloadedToday) {
              Alert.alert(
                "Today's Exam Module Required",
                `The exam pack on this phone was not downloaded today (${todayCheck.today}). You must update the exam pack before starting to ensure rescheduled applicants are included.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Go to Download',
                    onPress: () => {
                      setStartOpen(false);
                      router.push('/(proctor)/(tabs)/examination');
                    },
                  },
                ],
              );
              return;
            }

            const pack = await OfflineStore.getPack();
            const missing: string[] = [];
            if (!pack) {
              missing.push('Offline Exam Pack');
            } else {
              const hasQuestions = (pack.question_banks ?? []).some((b) => (b.subjects ?? []).some((s) => (s.questions ?? []).length > 0));
              if (!hasQuestions) missing.push('Question Bank');

              // Only block on critical missing data. Examination settings can use defaults.
              const sid = lobby?.session?.scheduleId ?? null;
              let scheduleExists = false;
              if (sid && String(sid).startsWith('date-')) {
                const d = String(sid).substring(5, 15);
                const t = String(sid).substring(16).replace(/-/g, ' ').toLowerCase().trim();
                scheduleExists = (pack.schedules ?? []).some((s) => {
                  const sDate = (s.exam_date || '').trim();
                  const sTitle = (s.title || 'Entrance Examination').toLowerCase().trim();
                  return sDate === d && (sTitle === t || t.includes(sTitle) || sTitle.includes(t));
                });
                if (!scheduleExists) {
                  scheduleExists = (pack.schedules ?? []).some((s) => (s.exam_date || '').trim() === d);
                }
              } else if (sid) {
                const sidClean = String(sid).replace(/^offline-/, '');
                scheduleExists = (pack.schedules ?? []).some((s) => String(s.id) === sidClean);
              }

              if (!scheduleExists && sid && (pack.schedules ?? []).length > 0) {
                scheduleExists = true;
              }

              if (!scheduleExists && sid) missing.push('Schedule Alignment');
            }
            if (missing.length) {
              Alert.alert(
                'System Update Required',
                `The following items are outdated or missing:\n\n• ${missing.join('\n• ')}\n\nPlease synchronize before starting the examination.`,
              );
              return;
            }

            // CRITICAL ISSUE 4: PROCTOR READINESS VALIDATION
            const notReady = Number(lobby?.notReadyCount ?? 0);
            if (notReady > 0) {
              Alert.alert(
                'Applicants Not Ready',
                `There are ${notReady} applicant(s) who have not completed package verification.\n\nAll connected applicants must download and verify the examination package before starting.`,
              );
              return;
            }

            // Wi‑Fi / LAN validation
            // If already hosting locally (peerHost is active), we don't need to reach the central server.
            const { assertCampusWifiForJoin } = await import('@/features/monitoring/services/campusWifiGate');
            const wifi = await assertCampusWifiForJoin({ requireServer: !peerHost, isProctor: true });
            if (!wifi.ok) {
              Alert.alert(
                'Unable to start',
                wifi.message ?? 'Please connect to the examination Wi‑Fi and try again.',
              );
              return;
            }

            setBusy(true);
            try {
              const snapshot = await LobbyRepository.startExamination(sessionId, roomId);
              setSnapshot(snapshot);
              await refresh();
              setStartOpen(false);
            } catch (error) {
              Alert.alert('Unable to start', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setBusy(false);
            }
          } catch (err) {
            Alert.alert('Unable to start', err instanceof Error ? err.message : 'Please try again.');
          }
        }}
      />

      <ConfirmationModal
        visible={endOpen}
        title={
          lobby?.status === 'lobby_open' ? 'Close Lobby?' : 'End Examination?'
        }
        description={
          lobby?.status === 'lobby_open'
            ? 'This closes the lobby before the exam starts. No new students can join until you open this room again.'
            : 'This immediately ends the exam, auto-submits every student still taking it, and closes the session. This cannot be undone.'
        }
        confirmLabel={lobby?.status === 'lobby_open' ? 'Yes, close lobby' : 'Yes, end now'}
        cancelLabel="Cancel"
        loading={busy}
        onCancel={() => setEndOpen(false)}
        onConfirm={async () => {
          if (!sessionId) return;
          setBusy(true);
          try {
            const wasLobbyOnly = lobby?.status === 'lobby_open';
            if (wasLobbyOnly) {
              await LobbyRepository.closeLobby(sessionId, roomId);
              setSnapshot(null);
            } else {
              const snapshot = await LobbyRepository.endExamination(sessionId, roomId);
              setSnapshot(snapshot);
              // Ensure this session is marked ended in offline store
              const sid = String(sessionId).replace(/^offline-/, '');
              if (roomId) {
                await OfflineStore.setOpenedRoom(
                  sid,
                  roomId,
                  lobby?.examinationCode || 'ENDED',
                  'ended',
                );
              }
            }
            await refresh();
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rooms(sessionId) });
            await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
            setEndOpen(false);
            Alert.alert(
              wasLobbyOnly ? 'Lobby closed' : 'Examination ended',
              wasLobbyOnly
                ? 'This room is closed but not ended. You can open it again when ready.'
                : 'All active examinees were submitted and the session is closed.',
            );
            router.replace('/(proctor)/(tabs)/examination');
          } catch (error) {
            Alert.alert(
              'Unable to close',
              error instanceof Error ? error.message : 'Please try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      />

      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setSelected(null);
          setReconnectCode(null);
          setReconnectExpiresAt(null);
        }}
      >
        <View style={styles.detailOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setSelected(null);
              setReconnectCode(null);
              setReconnectExpiresAt(null);
            }}
          />
          {selected ? (
            <View style={[styles.detailSheet, { backgroundColor: themeColors.card }]}>
              <Text style={[styles.detailTitle, { color: themeColors.textPrimary }]}>{selected.fullName}</Text>
              <StatusChip status={selected.status} />
              <DetailRow label="Gmail" value={selected.email} />
              <DetailRow label="Desired Program" value={selected.programName} />
              <DetailRow
                label="Download"
                value={`${Math.round(selected.downloadPercent ?? (selected.isReady ? 100 : 0))}%`}
              />
              <DetailRow
                label="Verification"
                value={selected.hashVerified || selected.isReady ? 'Verified' : 'Pending'}
              />
              <DetailRow
                label="Ready Status"
                value={selected.moduleReady || selected.isReady ? 'Ready' : 'Not ready'}
              />
              <DetailRow
                label="Current Status"
                value={
                  selected.status === 'taking_exam'
                    ? 'Taking'
                    : selected.status === 'disconnected'
                      ? 'Disconnected'
                      : selected.status === 'finished'
                        ? 'Done'
                        : selected.status.replace('_', ' ')
                }
              />
              <DetailRow label="Number of Violations" value={String(selected.violationCount)} />
              <DetailRow label="Time Connected" value={formatTime(selected.joinedAt)} />
              <DetailRow label="Time Started" value={formatTime(selected.startedAt)} />
              <DetailRow label="Last Activity" value={formatTime(selected.lastActivityAt)} />
              {selected.terminationReason ? (
                <DetailRow label="Termination" value={selected.terminationReason.replace('_', ' ')} />
              ) : null}

              {selected.status === 'disconnected' ? (
                <View style={[styles.reconnectBox, { backgroundColor: isDark ? '#2A1818' : themeColors.accentMuted }]}>
                  <Text style={[styles.reconnectLabel, { color: themeColors.textMuted }]}>Reconnect PIN (tell the student)</Text>
                  <Text style={[styles.reconnectCode, { color: themeColors.accent }]}>
                    {reconnectCode || selected.reconnectCode || '————'}
                  </Text>
                  <Text style={[styles.reconnectHint, { color: themeColors.textSecondary }]}>
                    6-digit PIN only — never the examination / QR code. Student enters it on the
                    lock screen after Wi‑Fi is back.
                    {(reconnectExpiresAt || selected.reconnectCodeExpiresAt)
                      ? ` Expires ${formatTime(reconnectExpiresAt || selected.reconnectCodeExpiresAt)}.`
                      : ''}
                  </Text>
                </View>
              ) : null}

              <View style={styles.detailActions}>
                {selected.status === 'disconnected' ? (
                  <Button
                    title="Issue new reconnect PIN"
                    fullWidth
                    loading={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        const result = await LobbyRepository.allowStudentReconnect(selected.id);
                        setReconnectCode(result.reconnectCode);
                        setReconnectExpiresAt(result.expiresAt);
                        await refresh();
                      } catch (error) {
                        Alert.alert(
                          'Reconnect failed',
                          error instanceof Error ? error.message : 'Unable to issue code.',
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ) : null}
                {selected.status === 'warning' ? (
                  <Button
                    title="Continue Exam"
                    fullWidth
                    loading={busy}
                    onPress={async () => {
                      setBusy(true);
                      await LobbyRepository.resumeStudent(selected.id);
                      await refresh();
                      setBusy(false);
                      setSelected(null);
                      setReconnectCode(null);
                    }}
                  />
                ) : null}
                  {(selected.status === 'waiting' || selected.status === 'connected' || selected.status === 'disconnected') ? (
                    <Button
                      title="Remove from Lobby"
                      variant="danger"
                      fullWidth
                      loading={busy}
                      onPress={async () => {
                        Alert.alert(
                          'Remove student?',
                          'This removes the student from the lobby so they must re-scan or re-register to rejoin.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                setBusy(true);
                                try {
                                  await LobbyRepository.removeStudent(selected.id);
                                  await refresh();
                                  setSelected(null);
                                  setReconnectCode(null);
                                } catch (error) {
                                  Alert.alert(
                                    'Unable to remove',
                                    error instanceof Error ? error.message : 'Please try again.',
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              },
                            },
                          ],
                        );
                      }}
                    />
                  ) : null}
                {selected.status === 'warning' ||
                selected.status === 'taking_exam' ||
                selected.status === 'disconnected' ? (
                  <Button
                    title="Terminate Examination"
                    variant="danger"
                    fullWidth
                    loading={busy}
                    onPress={async () => {
                      setBusy(true);
                      await LobbyRepository.terminateStudent(selected.id);
                      await refresh();
                      setBusy(false);
                      setSelected(null);
                      setReconnectCode(null);
                    }}
                  />
                ) : null}
                <Button
                  title="Close"
                  variant="outline"
                  fullWidth
                  onPress={() => {
                    setSelected(null);
                    setReconnectCode(null);
                    setReconnectExpiresAt(null);
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* 2. 'SWAP TOKENS INSTANTLY' → SWITCH ACTIVE ROOM/BATCH MODAL         */}
      {/* Two stacked cards, circular swap icon, room selector, red button    */}
      {/* =================================================================== */}
      <Modal
        visible={swapModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSwapModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSwapModalVisible(false)} />
          <View style={styles.swapModalCard}>
            <View style={styles.swapModalHeader}>
              <Text style={styles.swapModalTitle}>Switch Active Room</Text>
              <Pressable onPress={() => setSwapModalVisible(false)} hitSlop={8}>
                <X size={20} color="#71717A" />
              </Pressable>
            </View>
            <Text style={styles.swapModalSub}>
              Migrate local Wi-Fi broadcasting and student check-ins to a different room session.
            </Text>

            {/* CARD 1: CURRENT ACTIVE ROOM */}
            <View style={styles.swapCard}>
              <Text style={styles.swapCardTag}>CURRENT ACTIVE ROOM</Text>
              <View style={styles.swapCardMain}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.swapCardTitle}>
                    {lobby.session?.roomName || lobby.roomName || 'Room 101'}
                  </Text>
                  <Text style={styles.swapCardMeta}>
                    Batch {lobby.session?.batchNumber || '1'} · {lobby.registeredCount || lobby.students.length} Registered Candidates
                  </Text>
                </View>
                <View style={styles.swapActiveBadge}>
                  <Text style={styles.swapActiveBadgeText}>Active</Text>
                </View>
              </View>
            </View>

            {/* CIRCULAR SWAP ICON */}
            <View style={styles.swapCircleWrapper}>
              <View style={styles.swapCircle}>
                <ArrowDownUp size={18} color="#FFFFFF" />
              </View>
            </View>

            {/* CARD 2: SWITCH TO ROOM */}
            <View style={styles.swapCard}>
              <Text style={styles.swapCardTag}>SWITCH TO ROOM</Text>
              <View style={styles.roomSelectGrid}>
                {availableRooms.map((rm) => {
                  const isSelected = targetRoomId === rm.id;
                  return (
                    <Pressable
                      key={rm.id}
                      style={[
                        styles.roomSelectOption,
                        isSelected && styles.roomSelectOptionActive,
                      ]}
                      onPress={() => setTargetRoomId(rm.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.roomOptionName,
                            isSelected && styles.roomOptionNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {rm.name}
                        </Text>
                        <Text style={styles.roomOptionCap}>
                          Capacity: {rm.capacity} Applicants
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={styles.roomCheckBadge}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* DETAIL ROW */}
            <View style={styles.swapDetailNotice}>
              <Text style={styles.swapNoticeText}>
                The local HTTP server and WebSocket beacon will immediately rebind to the selected room.
              </Text>
            </View>

            {/* CONFIRM BUTTON */}
            <Button
              title="Confirm Room Switch"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleConfirmRoomSwitch}
              style={{ backgroundColor: colors.primary }}
            />
          </View>
        </View>
      </Modal>

      {/* =================================================================== */}
      {/* 3. 'SEND TOKENS' → GENERATE/ENTER ROOM ACCESS CODE MODAL           */}
      {/* Large 4-digit code display, numeric keypad, bold red button        */}
      {/* =================================================================== */}
      <Modal
        visible={codeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCodeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCodeModalVisible(false)} />
          <View style={styles.codeModalCard}>
            <View style={styles.swapModalHeader}>
              <Text style={styles.swapModalTitle}>Room Access Code</Text>
              <Pressable onPress={() => setCodeModalVisible(false)} hitSlop={8}>
                <X size={20} color="#71717A" />
              </Pressable>
            </View>
            <Text style={styles.swapModalSub}>
              Enter a custom numeric access code or generate a random passkey for examinees.
            </Text>

            {/* LARGE CODE DISPLAY AREA */}
            <View style={styles.keypadDisplayContainer}>
              <View style={styles.keypadDigitsRow}>
                {[0, 1, 2, 3].map((idx) => {
                  const char = keypadCode[idx];
                  const isCurrent = keypadCode.length === idx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.keypadDigitBox,
                        isCurrent && styles.keypadDigitBoxActive,
                        char && styles.keypadDigitBoxFilled,
                      ]}
                    >
                      <Text style={styles.keypadDigitText}>{char || '—'}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.keypadDisplayHint}>
                {keypadCode.length >= 4 ? 'Ready to Apply' : `Enter ${Math.max(0, 4 - keypadCode.length)} more digits`}
              </Text>
            </View>

            {/* NUMERIC KEYPAD GRID */}
            <View style={styles.keypadGrid}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['C', '0', '⌫'],
              ].map((row, rIdx) => (
                <View key={rIdx} style={styles.keypadRow}>
                  {row.map((btn) => (
                    <Pressable
                      key={btn}
                      style={styles.keypadBtn}
                      onPress={() => {
                        if (btn === 'C') handleKeypadClear();
                        else if (btn === '⌫') handleKeypadBackspace();
                        else handleKeypadPress(btn);
                      }}
                      hitSlop={6}
                    >
                      <Text
                        style={[
                          styles.keypadBtnText,
                          (btn === 'C' || btn === '⌫') && styles.keypadSpecialBtnText,
                        ]}
                      >
                        {btn}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            {/* ACTIONS: RANDOMIZE & SET CODE */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Button
                title="Randomize"
                variant="outline"
                onPress={handleKeypadRandom}
                style={{ flex: 1, borderColor: '#333333', backgroundColor: '#1E1E1E' }}
              />
              <Button
                title="Set Access Code"
                variant="primary"
                onPress={handleApplyCustomCode}
                style={{ flex: 2, backgroundColor: '#7A1F2B' }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors: themeColors } = useAppTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: themeColors.cardBorder }]}>
      <Text style={[styles.detailLabel, { color: themeColors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0D0D' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0D0D0D',
  },
  navLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navCenterBlock: {
    flex: 1,
    marginHorizontal: 10,
    alignItems: 'center',
  },
  navTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navSubtitleText: {
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '500',
    marginTop: 1,
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    borderWidth: 1.5,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  navIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262626',
  },

  // EXAMINATION LOBBY ACCESS PASS CARD
  accessPassCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  depositTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depositTagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  depositTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  depositLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  depositLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  depositLiveText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  qrWhiteFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroCodeSection: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  heroCodeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  heroCodeValue: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 6,
  },
  codeActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeSquareBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  depositDetailsTable: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
  },
  depositDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  depositDetailLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  depositDetailVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  depositDetailDivider: {
    height: 1,
  },
  cardInlineActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cardActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingVertical: 11,
    borderRadius: 12,
  },
  cardActionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  depositActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  depositOutlineBtn: {
    flex: 1,
    borderRadius: 14,
  },
  depositSolidBtn: {
    flex: 1.3,
    borderRadius: 14,
  },

  // 'SWAP TOKENS INSTANTLY' → SWITCH ACTIVE ROOM MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  swapModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    gap: 14,
  },
  swapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  swapModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  swapModalSub: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '500',
    lineHeight: 18,
  },
  swapCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262626',
    gap: 6,
  },
  swapCardTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7A1F2B',
    letterSpacing: 0.5,
  },
  swapCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  swapCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  swapCardMeta: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '500',
    marginTop: 2,
  },
  swapActiveBadge: {
    backgroundColor: '#142918',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  swapActiveBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#22C55E',
  },
  swapCircleWrapper: {
    alignItems: 'center',
    marginVertical: -6,
    zIndex: 2,
  },
  swapCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7A1F2B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#141414',
  },
  roomSelectGrid: {
    gap: 8,
    marginTop: 4,
  },
  roomSelectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    borderRadius: 10,
    padding: 10,
  },
  roomSelectOptionActive: {
    borderColor: '#7A1F2B',
    backgroundColor: '#201313',
  },
  roomOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4D4D8',
  },
  roomOptionNameActive: {
    color: '#FFFFFF',
  },
  roomOptionCap: {
    fontSize: 11,
    color: '#71717A',
    fontWeight: '500',
    marginTop: 2,
  },
  roomCheckBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7A1F2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapDetailNotice: {
    backgroundColor: '#1E1E1E',
    padding: 10,
    borderRadius: 10,
  },
  swapNoticeText: {
    fontSize: 11,
    color: '#A1A1AA',
    lineHeight: 16,
    fontWeight: '500',
  },

  // 'SEND TOKENS' → ROOM ACCESS CODE MODAL
  codeModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    gap: 14,
  },
  keypadDisplayContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#262626',
  },
  keypadDigitsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keypadDigitBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#333333',
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadDigitBoxActive: {
    borderColor: '#7A1F2B',
  },
  keypadDigitBoxFilled: {
    borderColor: '#7A1F2B',
    backgroundColor: '#201313',
  },
  keypadDigitText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  keypadDisplayHint: {
    fontSize: 11,
    color: '#71717A',
    fontWeight: '600',
  },
  keypadGrid: {
    gap: 8,
    marginTop: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  keypadBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  keypadBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  keypadSpecialBtnText: {
    fontSize: 15,
    color: '#7A1F2B',
    fontWeight: '900',
  },

  lobbySkeleton: { padding: 20, gap: 12 },
  list: { padding: 20, gap: 10, paddingBottom: 40 },
  headerBlock: { gap: 14, marginBottom: 8 },
  examHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  examName: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  line: { fontSize: 13, color: colors.inkSecondary, marginBottom: 4, fontWeight: '500' },
  infoLine: { fontSize: 14, color: colors.ink, marginBottom: 4, fontWeight: '800' },
  codeBlock: {
    marginTop: 16,
    alignItems: 'center',
    gap: 6,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
  codeHint: {
    fontSize: 12,
    color: colors.inkSecondary,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  peerBanner: {
    backgroundColor: '#071A0E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#166534',
    gap: 8,
  },
  peerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  peerTitle: { fontSize: 14, fontWeight: '800', color: colors.success },
  peerBody: { fontSize: 12, lineHeight: 18, color: colors.inkSecondary, fontWeight: '500' },
  peerNetworkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  peerNetwork: { fontSize: 11, fontWeight: '700', color: colors.success, textTransform: 'uppercase' },
  checklist: { paddingVertical: 4, gap: 2 },
  checkItem: { fontSize: 11, color: colors.success, fontWeight: '600' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '900', color: colors.success },
  monitorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
  monitorTimer: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  monitorLine: {
    fontSize: 14,
    color: colors.inkSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  endedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#ECFDF5',
    borderColor: colors.success,
  },
  endedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.success,
    marginBottom: 4,
  },
  endedBody: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSecondary,
    fontWeight: '500',
  },
  ownerHint: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  actions: { gap: 10 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'stretch',
  },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  section: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.inkSecondary,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 10,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
  historyEmpty: { fontSize: 13, color: colors.inkMuted, fontWeight: '500' },
  historyRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyKind: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
    width: 72,
    marginTop: 2,
  },
  historyDisconnect: { color: colors.danger },
  historyBody: { fontSize: 13, color: colors.ink, fontWeight: '600', lineHeight: 18 },
  historyTime: { fontSize: 11, color: colors.inkMuted, marginTop: 2, fontWeight: '500' },
  empty: {
    textAlign: 'center',
    color: colors.inkMuted,
    fontSize: 13,
    paddingVertical: 20,
  },
  errorWrap: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  errorBody: {
    fontSize: 14,
    color: colors.inkSecondary,
    lineHeight: 21,
    marginBottom: 8,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 10,
    maxHeight: '85%',
  },
  detailTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, flex: 1 },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    flex: 1.4,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  reconnectBox: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    gap: 6,
  },
  reconnectLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  reconnectCode: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 4,
  },
  reconnectHint: {
    fontSize: 12,
    color: colors.inkSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  detailActions: { gap: 10, marginTop: 8 },
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
