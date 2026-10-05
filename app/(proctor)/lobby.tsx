import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, ScrollView, Modal, Pressable as RNPressable, Text, View, StyleSheet, Alert, Share, useWindowDimensions, Platform, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import type { NavigationAction } from '@react-navigation/routers';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useKeepAwake } from 'expo-keep-awake';
import { Button } from '@/shared/components/ui/Button';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
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
import { useLobby } from '@/features/lobby/hooks/useLobby';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QUERY_KEYS } from '@/shared/constants';
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';
import { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { startProctorHostIpSync } from '@/features/monitoring/services/proctorHostIpSync';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { colors } from '@/shared/theme';
import type { LobbyStudent } from '@/shared/types';
import { safeBack } from '@/shared/utils';
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
  ArrowDownUp,
  ArrowLeft,
  RefreshCw,
  Check,
  Share2,
  Wifi,
  WifiOff,
  Search,
  Bell,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Keyboard,
  CalendarDays,
  Clock,
  MapPin,
  DoorOpen,
} from 'lucide-react-native';

type PressableBoxProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

function PressableBox({ android_ripple, ...props }: PressableBoxProps) {
  return (
    <RNPressable
      {...props}
      android_ripple={android_ripple ?? { color: 'rgba(0,0,0,0.06)' }}
    />
  );
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatScheduleDate(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || 'Date not set';
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatScheduleClock(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/(?:^|T)(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return raw;
  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

function formatScheduleTime(start: string | null | undefined, end: string | null | undefined, fallback?: string) {
  const startLabel = formatScheduleClock(start);
  const endLabel = formatScheduleClock(end);
  if (startLabel && endLabel) return `${startLabel}–${endLabel}`;
  if (startLabel) return startLabel;
  if (endLabel) return endLabel;
  const label = String(fallback ?? '').trim();
  if (label && !['standard session', 'offline exam'].includes(label.toLowerCase())) return label;
  return 'Time not set';
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

/**
 * Proctor lobby reference palette (approved light mockup).
 * Mirrors the `@/shared/theme` light tokens (cream / maroon) plus the gold hero accents,
 * kept in one place so every block of this screen stays consistent.
 */
const LOBBY = {
  background: '#FAF7F2',
  card: '#FFFDF8',
  border: '#E6DCCB',
  maroon: '#7B1C2B',
  gold: '#F3D58A',
  ink: '#2B1A1A',
  muted: '#7A6A63',
  danger: '#A32D2D',
  onMaroon: '#FFF6E5',
  softBorder: '#D9C9B4',
  softFill: '#F3ECE0',
  divider: '#EDE4D8',
} as const;

/** Monitoring tile tones (background / text) — values from the approved mockup. */
const LOBBY_STATUS_TONES = {
  waiting: { bg: '#FAEEDA', text: '#633806' },
  answering: { bg: '#E6F1FB', text: '#0C447C' },
  submitted: { bg: '#EAF3DE', text: '#27500A' },
  disconnected: { bg: '#FCEBEB', text: '#791F1F' },
} as const;

/** "2 min ago" style label for the last time a student was seen on the LAN. */
function formatLastSeen(iso: string | null | undefined) {
  if (!iso) return 'Unknown';
  const stamp = new Date(iso).getTime();
  if (Number.isNaN(stamp)) return 'Unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - stamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Initials for the roster avatar (API value first, fall back to the full name). */
function initialsOf(student: { avatarInitials?: string | null; fullName?: string | null }) {
  const fromApi = String(student.avatarInitials ?? '').trim();
  if (fromApi) return fromApi.slice(0, 2).toUpperCase();
  const parts = String(student.fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'ST';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ProctorLobbyContent() {
  useKeepAwake();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { colors: themeColors, isDark } = useAppTheme();
  const { sessionId, roomId, examSessionId, scheduleId } = useLocalSearchParams<{
    sessionId: string;
    roomId?: string;
    examSessionId?: string;
    scheduleId?: string;
  }>();
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const storeLobby = useLobbyStore((s) => s.snapshot);
  const selectedSchedule = useProctorStore((s) => s.selectedSchedule);
  const [busy, setBusy] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [allowLeave, setAllowLeave] = useState(false);
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
  const pendingLeaveActionRef = useRef<NavigationAction | null>(null);
  const pendingLeaveContinuationRef = useRef<(() => void) | null>(null);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; at: string; kind: 'connect' | 'disconnect' }>
  >([]);
  const [clockTick, setClockTick] = useState(0);
  const [activeStatusFilter, setActiveStatusFilter] = useState<
    'waiting' | 'taking' | 'submitted' | 'disconnected' | null
  >('taking');
  const [reconnectCode, setReconnectCode] = useState<string | null>(null);
  const [reconnectExpiresAt, setReconnectExpiresAt] = useState<string | null>(null);
  const [peerHost, setPeerHost] = useState<string | null>(null);
  const [hosting, setHosting] = useState(PeerExamServer.info());
  const [batteryOptimizationExempt, setBatteryOptimizationExempt] = useState(true);
  const [serverLastHeartbeat, setServerLastHeartbeat] = useState<number>(Date.now());
  const [cloudCode, setCloudCode] = useState<string | null>(null);
  const [cloudQrValue, setCloudQrValue] = useState<string | null>(null);
  const [cloudSessionId, setCloudSessionId] = useState<number | null>(null);
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set());

  const toggleAttendance = (studentId: string) => {
    setAttendedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleRemoveStudent = (student: LobbyStudent) => {
    Alert.alert(
      'Remove Examinee',
      `Examinee: ${student.fullName}\n\nAre you sure you want to remove this examinee from the session? Their device will be immediately disconnected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Examinee',
          style: 'destructive',
          onPress: async () => {
            try {
              await LobbyRepository.removeStudent(student.id, 'Removed by proctor');
              await refresh();
              Alert.alert('Examinee Removed', `${student.fullName} has been removed from this room.`);
            } catch (err) {
              Alert.alert('Removal Failed', err instanceof Error ? err.message : 'Could not remove student.');
            }
          },
        },
      ],
    );
  };

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
    const codeToShare = cloudCode || storeLobby?.examinationCode || lobby?.examinationCode;
    if (!codeToShare) return;
    try {
      await Share.share({
        message: `Examination Access Code: ${codeToShare}\nRoom: ${storeLobby?.session?.roomName || lobby?.session?.roomName || 'Exam Room'}\nConnect to Wi-Fi: ${storeLobby?.wifiSsid || lobby?.wifiSsid || 'Testing Wi-Fi'}`,
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

  useEffect(() => {
    let mounted = true;
    if (Platform.OS !== 'android') {
      setBatteryOptimizationExempt(true);
      return;
    }
    const checkExemption = () => {
      void ExamSecurityService.isIgnoringBatteryOptimizations().then((isExempt) => {
        if (mounted) setBatteryOptimizationExempt(isExempt);
      });
    };
    checkExemption();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkExemption();
    });
    return () => {
      mounted = false;
      appStateSub.remove();
    };
  }, []);

  // Peer mode: push updates to UI, but throttled to prevent JS thread lockup during high-traffic heartbeats.
  useEffect(() => {
    let lastRefresh = 0;
    return PeerExamServer.subscribe(() => {
      const now = Date.now();
      setPeerHost(PeerExamServer.info().host);
      setHosting(PeerExamServer.info());
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

  const requestLeave = () => {
    if (!ready || openError || !lobby || lobby.status === 'ended') {
      goBack();
      return;
    }
    pendingLeaveActionRef.current = null;
    setLeaveOpen(true);
  };

  usePreventRemove(
    ready && !openError && Boolean(lobby) && lobby?.status !== 'ended' && !allowLeave,
    ({ data }) => {
      pendingLeaveActionRef.current = data.action;
      setLeaveOpen(true);
    },
  );

  useEffect(() => {
    if (!allowLeave) return;
    const continuation = pendingLeaveContinuationRef.current;
    pendingLeaveContinuationRef.current = null;
    continuation?.();
  }, [allowLeave]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!ready || !lobby || lobby.status === 'ended') return false;
      if (leaveOpen) {
        setLeaveOpen(false);
        pendingLeaveActionRef.current = null;
        return true;
      }
      pendingLeaveActionRef.current = null;
      setLeaveOpen(true);
      return true;
    });
    return () => subscription.remove();
  }, [ready, lobby?.status, leaveOpen]);

  useEffect(() => {
    if (lobby?.status === 'ended') {
      setLeaveOpen(false);
      setEndOpen(false);
      pendingLeaveActionRef.current = null;
    }
  }, [lobby?.status]);

  // ─── Derived student lists (MUST be above every early-return) ─────────────
  // React requires hooks to run the same number of times on every render.
  // These were originally placed AFTER `if (!ready) return` — that caused
  // "Rendered more hooks than during previous render" crash → blank screen.
  const studentsList = useMemo(
    () => (Array.isArray(lobby?.students) ? lobby!.students : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lobby?.students],
  );
  const waitingStudents = useMemo(
    () => studentsList.filter((s) => s.status === 'waiting' || s.status === 'connected'),
    [studentsList],
  );
  const takingStudents = useMemo(
    () => studentsList.filter((s) => s.status === 'taking_exam' || s.status === 'warning'),
    [studentsList],
  );
  const completedStudents = useMemo(
    () => studentsList.filter((s) => s.status === 'finished'),
    [studentsList],
  );
  const disconnectedStudents = useMemo(
    () => studentsList.filter((s) => s.status === 'disconnected'),
    [studentsList],
  );
  // ─────────────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <View style={[styles.screen, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
        <View style={styles.navBar}>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.navCircleBtn}
            onPress={goBack}
            hitSlop={6}
          >
            <ArrowLeft size={20} color={LOBBY.ink} strokeWidth={2.2} />
          </PressableBox>
          <View style={styles.navCenterBlock}>
            <Text style={styles.navTitleText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              Entrance Examination
            </Text>
            <Text style={styles.navSubtitleText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              Connecting to peer server…
            </Text>
          </View>
          <View style={styles.navActionSpacer} />
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
        <View style={styles.navBar}>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.navCircleBtn}
            onPress={goBack}
            hitSlop={6}
          >
            <ArrowLeft size={20} color={LOBBY.ink} strokeWidth={2.2} />
          </PressableBox>
          <View style={styles.navCenterBlock}>
            <Text style={styles.navTitleText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              Entrance Examination
            </Text>
            <Text style={styles.navSubtitleText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              Proctor lobby
            </Text>
          </View>
          <View style={styles.navActionSpacer} />
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

  const displayCode = cloudCode || lobby?.examinationCode || '----';
  const displayQrValue = lobby?.qrValue || cloudQrValue || displayCode;

  const copyCode = async () => {
    try {
      const codeToCopy = displayCode !== '----' ? displayCode : (lobby.examinationCode ?? '');
      await Clipboard.setStringAsync(codeToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert('Examination Code', displayCode);
    }
  };

  const scheduleLabel =
    lobby.schedule?.name ||
    selectedSchedule?.name ||
    'Examination Schedule';
  const rawRoom = lobby.session?.roomName || lobby.roomName || 'Room 01';
  const cleanRoomLabel =
    rawRoom
      .replace(/\s*·\s*Batch\s*\d+/gi, '')
      .replace(/\s*-\s*Batch\s*\d+/gi, '')
      .replace(/\s*,\s*Batch\s*\d+/gi, '')
      .replace(/\s*Batch\s*\d+/gi, '')
      .trim() || 'Room 01';
  const roomLabel = cleanRoomLabel;

  const activeSchedule = lobby.schedule || selectedSchedule;
  const examDate = formatScheduleDate(
    activeSchedule?.examinationDate ||
    activeSchedule?.examinationDateIso ||
    '',
  );
  const sessionTime = formatScheduleTime(
    lobby.session?.startTime,
    lobby.session?.endTime,
    lobby.session?.timeLabel || activeSchedule?.timeLabel,
  );

  const monitoringTabs: Array<{
    key: 'waiting' | 'taking' | 'submitted' | 'disconnected';
    label: string;
    subtitle: string;
    /** Label for the value shown on the right of the list header ("N students · <metric>"). */
    metric: string;
    count: number;
    emptyMessage: string;
    students: LobbyStudent[];
    icon: (color: string) => React.ReactNode;
    tone: { bg: string; text: string };
    /** Pill value shown on the right of each student row. */
    pillOf: (student: LobbyStudent) => string;
  }> = [
    {
      key: 'waiting',
      label: 'Waiting',
      subtitle: 'In lobby',
      metric: 'Joined',
      count: waitingStudents.length,
      emptyMessage: 'No students are waiting in the lobby.',
      students: waitingStudents,
      icon: (color: string) => <Clock size={20} color={color} strokeWidth={2.2} />,
      tone: LOBBY_STATUS_TONES.waiting,
      pillOf: (student) => formatTime(student.joinedAt),
    },
    {
      key: 'taking',
      label: 'Answering',
      subtitle: 'Taking exam',
      metric: 'Started',
      count: takingStudents.length,
      emptyMessage: 'No students are answering the examination right now.',
      students: takingStudents,
      icon: (color: string) => <Play size={20} color={color} strokeWidth={2.2} />,
      tone: LOBBY_STATUS_TONES.answering,
      pillOf: (student) => formatTime(student.startedAt ?? student.lastActivityAt),
    },
    {
      key: 'submitted',
      label: 'Submitted',
      subtitle: 'Completed',
      metric: 'Submitted',
      count: completedStudents.length,
      emptyMessage: 'No students have submitted the examination yet.',
      students: completedStudents,
      icon: (color: string) => <CheckCircle2 size={20} color={color} strokeWidth={2.2} />,
      tone: LOBBY_STATUS_TONES.submitted,
      pillOf: (student) => formatTime(student.submittedAt),
    },
    {
      key: 'disconnected',
      label: 'Disconnected',
      subtitle: 'Offline',
      metric: 'Last seen',
      count: disconnectedStudents.length,
      emptyMessage: 'No students are disconnected.',
      students: disconnectedStudents,
      icon: (color: string) => <WifiOff size={20} color={color} strokeWidth={2.2} />,
      tone: LOBBY_STATUS_TONES.disconnected,
      pillOf: (student) => formatLastSeen(student.lastActivityAt),
    },
  ];

  const currentTab = monitoringTabs.find((t) => t.key === activeStatusFilter) ?? null;

  // QR must stay big so students can scan it: white square frame, full card width, max 340dp.
  const qrFrameSize = Math.min(340, Math.max(200, windowWidth - 56));
  const qrSize = qrFrameSize - 30;
  const listenerLabel =
    hosting.listenerState === 'live'
      ? 'LAN live'
      : hosting.listenerState === 'reconnecting'
        ? 'LAN reconnecting'
        : 'LAN stopped';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* A. HEADER — back and centered title */}
      <View style={styles.navBar}>
        <PressableBox
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.navCircleBtn}
          onPress={requestLeave}
          hitSlop={6}
        >
          <ArrowLeft size={20} color={LOBBY.ink} strokeWidth={2.2} />
        </PressableBox>

        <View style={styles.navCenterBlock}>
          <Text
            style={styles.navTitleText}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            Entrance Examination
          </Text>
          <Text
            style={styles.navSubtitleText}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            Proctor lobby
          </Text>
        </View>

        <View style={styles.navActionSpacer} />
      </View>

      {Platform.OS === 'android' && !batteryOptimizationExempt ? (
        <View style={styles.batteryWarningBanner}>
          <AlertTriangle size={18} color={LOBBY.gold} strokeWidth={2.2} />
          <Text style={styles.batteryWarningText}>
            Battery restrictions may pause this room when the screen is off.
          </Text>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Open battery settings"
            style={styles.batteryWarningButton}
            android_ripple={{ color: 'rgba(255,255,255,0.18)', borderless: false }}
            onPress={() => void ExamSecurityService.requestBatteryOptimizationExemption()}
          >
            <Text style={styles.batteryWarningButtonText}>Allow</Text>
          </PressableBox>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.headerBlock}>
            {/* ============================================================= */}
            {/* B. CURRENT SCHEDULE HERO — solid maroon, gold accents, schedule shown once */}
            <View
              style={styles.scheduleHeroCard}
              accessibilityLabel={`Current schedule: ${scheduleLabel}`}
            >
              <View style={styles.scheduleHeroTopRow}>
                <Text style={styles.scheduleHeroEyebrow} maxFontSizeMultiplier={1.2}>
                  Current schedule
                </Text>
                <View style={styles.scheduleHeroLivePill}>
                  {hosting.listenerState === 'live' ? (
                    <Wifi size={15} color={LOBBY.maroon} strokeWidth={2.4} />
                  ) : hosting.listenerState === 'reconnecting' ? (
                    <RefreshCw size={15} color={LOBBY.maroon} strokeWidth={2.4} />
                  ) : (
                    <WifiOff size={15} color={LOBBY.maroon} strokeWidth={2.4} />
                  )}
                  <Text style={styles.scheduleHeroLiveText} maxFontSizeMultiplier={1.2}>
                    {listenerLabel}
                  </Text>
                </View>
              </View>

              <Text style={styles.scheduleHeroDate} maxFontSizeMultiplier={1.2}>
                {examDate}
              </Text>

              <View style={styles.scheduleHeroTimeRow}>
                <Clock size={18} color={LOBBY.gold} strokeWidth={2.2} />
                <Text style={styles.scheduleHeroTimeText} maxFontSizeMultiplier={1.25}>
                  {sessionTime}
                </Text>
              </View>

              <View style={styles.scheduleHeroChipsRow}>
                <View style={styles.scheduleHeroChip}>
                  <MapPin size={15} color={LOBBY.onMaroon} strokeWidth={2} />
                  <Text style={styles.scheduleHeroChipText} maxFontSizeMultiplier={1.25}>
                    {cleanRoomLabel}
                  </Text>
                </View>
                <View style={styles.scheduleHeroChip}>
                  <Users size={15} color={LOBBY.onMaroon} strokeWidth={2} />
                  <Text style={styles.scheduleHeroChipText} maxFontSizeMultiplier={1.25}>
                    {`${lobby.registeredCount || studentsList.length} candidates`}
                  </Text>
                </View>
                <View style={styles.scheduleHeroChip}>
                  <Wifi size={15} color={LOBBY.onMaroon} strokeWidth={2} />
                  <Text style={styles.scheduleHeroChipText} maxFontSizeMultiplier={1.25}>
                    {`IP ${peerHost || hosting.host || 'LAN host'}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* C. EXAMINATION ACCESS PASS — big QR, code + copy/share, two equal buttons */}
            <View style={styles.accessPassCard}>
              <View style={styles.passHeaderRow}>
                <Text style={styles.passHeaderTitle} maxFontSizeMultiplier={1.2}>
                  Examination access pass
                </Text>
                <Text style={styles.passHeaderHint} maxFontSizeMultiplier={1.2}>
                  Students scan this
                </Text>
              </View>

              {/* Big, square white QR frame (students must be able to scan it) */}
              <View
                style={[
                  styles.qrWhiteFrame,
                  { width: qrFrameSize, height: qrFrameSize },
                ]}
              >
                <QrCodePanel
                  value={displayQrValue}
                  size={qrSize}
                  frame={false}
                  note={null}
                />
              </View>

              <Text style={styles.qrHint} maxFontSizeMultiplier={1.2}>
                {lobby.status === 'in_progress'
                  ? 'Exam in progress · New scans are locked'
                  : peerHost
                    ? `Connect to ${lobby.wifiSsid || 'Exam Wi-Fi'} then scan`
                    : 'Hold steady · Students scan the QR with their device to enter'}
              </Text>

              {/* Room access code + copy / share */}
              <View style={styles.accessCodeRow}>
                <Text style={styles.accessCodeValue} maxFontSizeMultiplier={1.3}>
                  {displayCode}
                </Text>
                <PressableBox
                  style={styles.codeSquareBtn}
                  onPress={copyCode}
                  accessibilityRole="button"
                  accessibilityLabel="Copy access code"
                  hitSlop={6}
                >
                  {copied ? (
                    <Check size={20} color="#27500A" strokeWidth={2.4} />
                  ) : (
                    <Copy size={20} color={LOBBY.maroon} strokeWidth={2.2} />
                  )}
                </PressableBox>
                <PressableBox
                  style={styles.codeSquareBtn}
                  onPress={handleShareCode}
                  accessibilityRole="button"
                  accessibilityLabel="Share access code"
                  hitSlop={6}
                >
                  <Share2 size={20} color={LOBBY.maroon} strokeWidth={2.2} />
                </PressableBox>
              </View>
              <Text style={styles.accessCodeHint} maxFontSizeMultiplier={1.2}>
                Room access code
              </Text>

              {/* Two equal actions: Regenerate QR (outline) · Start Examination (filled) */}
              <View style={styles.passActionsRow}>
                <Button
                  title="Regenerate QR"
                  variant="outline"
                  icon={<RefreshCw size={17} color={LOBBY.maroon} strokeWidth={2.2} />}
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
                  style={[styles.passActionBtn, { borderColor: LOBBY.softBorder }]}
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
                  icon={
                    lobby.status === 'in_progress' ? (
                      <DoorOpen size={17} color={LOBBY.onMaroon} strokeWidth={2.2} />
                    ) : (
                      <Play size={17} color={LOBBY.onMaroon} strokeWidth={2.2} />
                    )
                  }
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
                  style={[styles.passActionBtn, { backgroundColor: LOBBY.maroon }]}
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
              <Card style={styles.timerCard}>
                <Text style={styles.timerCardTitle} maxFontSizeMultiplier={1.2}>
                  Time remaining
                </Text>
                <Text style={styles.timerCardValue} maxFontSizeMultiplier={1.2}>
                  {formatRemaining(remainingLive)}
                </Text>
              </Card>
            ) : null}

            {/* D. MONITORING — equal-width 2×2 tiles + the selected status roster */}
            <View style={styles.monitoringSection}>
              <View style={styles.monitoringHeaderRow}>
                <Text style={styles.monitoringSectionTitle} maxFontSizeMultiplier={1.2}>
                  Monitoring
                </Text>
                <Text style={styles.monitoringSectionSubtitle} maxFontSizeMultiplier={1.2}>
                  Tap a status to see students
                </Text>
              </View>

              <View style={styles.statusCardsGrid}>
                {monitoringTabs.map((tab) => {
                  const isActive = activeStatusFilter === tab.key;
                  return (
                    <PressableBox
                      key={tab.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`${tab.label}: ${tab.count} students. ${tab.subtitle}`}
                      onPress={() =>
                        setActiveStatusFilter((prev) => (prev === tab.key ? null : tab.key))
                      }
                      android_ripple={{ color: 'rgba(0,0,0,0.05)', borderless: false }}
                      style={[
                        styles.statusCard,
                        {
                          backgroundColor: tab.tone.bg,
                          borderColor: isActive ? tab.tone.text : LOBBY.border,
                          borderWidth: isActive ? 3 : 1,
                        },
                      ]}
                    >
                      {tab.icon(tab.tone.text)}
                      <Text
                        style={[styles.cardCountText, { color: tab.tone.text }]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {tab.count}
                      </Text>
                      <Text
                        style={[styles.cardLabelText, { color: tab.tone.text }]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {tab.label}
                      </Text>
                      <Text
                        style={[styles.cardSubtitleText, { color: tab.tone.text }]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {tab.subtitle}
                      </Text>
                    </PressableBox>
                  );
                })}
              </View>

              {activeStatusFilter && currentTab ? (
                <View style={styles.statusListBlock}>
                  <View style={styles.statusListHeaderRow}>
                    <Text
                      style={[styles.statusListTitle, { color: currentTab.tone.text }]}
                      maxFontSizeMultiplier={1.2}
                    >
                      {currentTab.label}
                    </Text>
                    <Text style={styles.statusListMeta} maxFontSizeMultiplier={1.2}>
                      {`${currentTab.students.length} students · ${currentTab.metric}`}
                    </Text>
                  </View>

                  {currentTab.students.length === 0 ? (
                    <Text style={styles.statusListEmpty} maxFontSizeMultiplier={1.2}>
                      {currentTab.emptyMessage}
                    </Text>
                  ) : (
                    currentTab.students.map((item) => (
                      <PressableBox
                        key={item.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.fullName}, applicant ${item.studentId || 'unknown'}, ${currentTab.pillOf(item)}`}
                        onPress={() => {
                          setSelected(item);
                          setReconnectCode(item.reconnectCode ?? null);
                          setReconnectExpiresAt(item.reconnectCodeExpiresAt ?? null);
                        }}
                        style={styles.statusRow}
                      >
                        <View
                          style={[styles.statusRowAvatar, { backgroundColor: currentTab.tone.bg }]}
                        >
                          <Text
                            style={[styles.statusRowAvatarText, { color: currentTab.tone.text }]}
                            maxFontSizeMultiplier={1.15}
                          >
                            {initialsOf(item)}
                          </Text>
                        </View>
                        <View style={styles.statusRowInfo}>
                          <Text style={styles.statusRowName} maxFontSizeMultiplier={1.25}>
                            {item.fullName}
                          </Text>
                          <Text style={styles.statusRowId} maxFontSizeMultiplier={1.25}>
                            {item.studentId || item.applicantCode || 'No applicant number'}
                          </Text>
                        </View>
                        <View
                          style={[styles.statusRowPill, { backgroundColor: currentTab.tone.bg }]}
                        >
                          <Text
                            style={[styles.statusRowPillText, { color: currentTab.tone.text }]}
                            maxFontSizeMultiplier={1.25}
                          >
                            {currentTab.pillOf(item)}
                          </Text>
                        </View>
                      </PressableBox>
                    ))
                  )}
                </View>
              ) : (
                <Text style={styles.statusListEmpty} maxFontSizeMultiplier={1.2}>
                  {studentsList.length === 0
                    ? 'No students have joined yet. Share the QR code or access code.'
                    : 'Tap a status above to see the students in it.'}
                </Text>
              )}
            </View>

          </View>
        </ScrollView>

        {lobby.status !== 'ended' ? (
          <View style={[styles.closeFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <PressableBox
              accessibilityRole="button"
              accessibilityLabel={
                lobby.status === 'in_progress'
                  ? 'End and close examination room'
                  : 'Close lobby'
              }
              disabled={lobby.can_control === false || busy}
              onPress={() => setEndOpen(true)}
              style={[
                styles.closeLobbyBtn,
                lobby.can_control === false && styles.closeLobbyBtnDisabled,
              ]}
            >
              <DoorOpen size={20} color={LOBBY.danger} strokeWidth={2.2} />
              <Text style={styles.closeLobbyBtnText} maxFontSizeMultiplier={1.2}>
                {lobby.status === 'in_progress' ? 'End & close examination room' : 'Close lobby'}
              </Text>
            </PressableBox>
          </View>
        ) : null}

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
              const hasPack = await OfflineStore.hasPack();
              if (hasPack) {
                // Device already has the pack; acknowledge so the exam can proceed smoothly.
                await OfflineStore.markPackAcknowledgedToday();
              } else {
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
          lobby?.status === 'lobby_open'
            ? 'Close this lobby?'
            : 'End examination and close the room?'
        }
        description={
          lobby?.status === 'lobby_open'
            ? 'Students will no longer be able to join with this QR or access code. You can open the room again later.'
            : 'This ends the exam now, auto-submits every student still answering, and closes the session. This cannot be undone.'
        }
        confirmLabel={lobby?.status === 'lobby_open' ? 'Yes, close lobby' : 'Yes, end and close'}
        cancelLabel="Cancel"
        danger
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
              // Ensure this session is marked ended in offline store (numeric schedule id).
              if (roomId) {
                const pack = await OfflineStore.getPack();
                const { resolveNumericScheduleId } = await import(
                  '@/features/examinations/services/peerExamServer'
                );
                const sid =
                  resolveNumericScheduleId(String(sessionId).replace(/^offline-/, ''), pack) ||
                  resolveNumericScheduleId(String(lobby?.session?.scheduleId ?? ''), pack);
                if (sid > 0) {
                  await OfflineStore.setOpenedRoom(
                    sid,
                    roomId,
                    lobby?.examinationCode || 'ENDED',
                    'ended',
                  );
                }
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
            pendingLeaveContinuationRef.current = () =>
              router.replace('/(proctor)/(tabs)/examination');
            setAllowLeave(true);
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

      <ConfirmationModal
        visible={leaveOpen}
        title="Leave this lobby?"
        description="Leaving this screen does not close the room. Students stay connected and the exam keeps running. Use Close lobby to close the room."
        confirmLabel="Yes, leave"
        cancelLabel="Stay"
        onCancel={() => {
          pendingLeaveActionRef.current = null;
          setLeaveOpen(false);
        }}
        onConfirm={() => {
          setLeaveOpen(false);
          const action = pendingLeaveActionRef.current;
          pendingLeaveActionRef.current = null;
          pendingLeaveContinuationRef.current = action
            ? () => navigation.dispatch(action)
            : goBack;
          setAllowLeave(true);
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
          <PressableBox
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
                {/* Attendance marker — kept reachable now that roster rows are compact */}
                <PressableBox
                  accessibilityRole="button"
                  accessibilityState={{ selected: attendedIds.has(selected.id) }}
                  accessibilityLabel="Toggle verified in room"
                  onPress={() => toggleAttendance(selected.id)}
                  style={[
                    styles.attendanceToggle,
                    {
                      backgroundColor: attendedIds.has(selected.id)
                        ? LOBBY_STATUS_TONES.submitted.bg
                        : LOBBY.card,
                      borderColor: attendedIds.has(selected.id)
                        ? LOBBY_STATUS_TONES.submitted.text
                        : LOBBY.border,
                    },
                  ]}
                >
                  <View style={styles.attendanceToggleInner}>
                    {attendedIds.has(selected.id) ? (
                      <Check size={16} color={LOBBY_STATUS_TONES.submitted.text} strokeWidth={2.6} />
                    ) : (
                      <UserCheck size={16} color={LOBBY.muted} strokeWidth={2.2} />
                    )}
                    <Text
                      style={[
                        styles.attendanceToggleText,
                        {
                          color: attendedIds.has(selected.id)
                            ? LOBBY_STATUS_TONES.submitted.text
                            : LOBBY.ink,
                        },
                      ]}
                      maxFontSizeMultiplier={1.2}
                    >
                      {attendedIds.has(selected.id) ? 'Verified in room' : 'Mark as verified in room'}
                    </Text>
                  </View>
                </PressableBox>
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
          <PressableBox style={StyleSheet.absoluteFill} onPress={() => setSwapModalVisible(false)} />
          <View style={styles.swapModalCard}>
            <View style={styles.swapModalHeader}>
              <Text style={styles.swapModalTitle}>Switch Active Room</Text>
              <PressableBox onPress={() => setSwapModalVisible(false)} hitSlop={8}>
                <X size={20} color="#71717A" />
              </PressableBox>
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
                    {examDate} · {sessionTime} · {lobby.registeredCount || studentsList.length} Registered Candidates
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
                    <PressableBox
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
                    </PressableBox>
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
          <PressableBox style={StyleSheet.absoluteFill} onPress={() => setCodeModalVisible(false)} />
          <View style={styles.codeModalCard}>
            <View style={styles.swapModalHeader}>
              <Text style={styles.swapModalTitle}>Room Access Code</Text>
              <PressableBox onPress={() => setCodeModalVisible(false)} hitSlop={8}>
                <X size={20} color="#71717A" />
              </PressableBox>
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
                    <PressableBox
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
                    </PressableBox>
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

/**
 * Default export — what Expo Router mounts.
 * ProctorLobbyContent is wrapped in ErrorBoundary so any render crash
 * shows a visible on-screen message instead of a blank white screen.
 */
export default function ProctorLobbyScreen() {
  const { useRouter } = require('expo-router');
  const router = useRouter();
  return (
    <ErrorBoundary
      fallbackTitle="Examination Lobby Error"
      fallbackMessage="Could not load the examination lobby. Tap 'Try Again' to reload, or go back to the dashboard."
      onReset={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(proctor)/(tabs)/examination');
        }
      }}
    >
      <ProctorLobbyContent />
    </ErrorBoundary>
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
  screen: { flex: 1, backgroundColor: LOBBY.background },

  // HEADER — 42dp circles, centered title
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: LOBBY.background,
  },
  batteryWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LOBBY.gold,
    backgroundColor: LOBBY.card,
  },
  batteryWarningText: {
    flex: 1,
    minWidth: 0,
    color: LOBBY.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  batteryWarningButton: {
    minHeight: 36,
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: LOBBY.maroon,
    overflow: 'hidden',
  },
  batteryWarningButtonText: {
    color: LOBBY.onMaroon,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  navCircleBtn: {
    width: 42,
    height: 42,
    minWidth: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LOBBY.card,
    borderWidth: 1,
    borderColor: LOBBY.border,
  },
  navActionSpacer: { width: 42, height: 42 },
  navCenterBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    minWidth: 0,
  },
  navTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: LOBBY.ink,
    textAlign: 'center',
  },
  navSubtitleText: {
    fontSize: 13,
    color: LOBBY.muted,
    fontWeight: '500',
    textAlign: 'center',
  },

  // CURRENT SCHEDULE HERO — solid maroon, gold accents
  scheduleHeroCard: {
    backgroundColor: LOBBY.maroon,
    borderRadius: 20,
    padding: 16,
    gap: 0,
    marginTop: 14,
  },
  scheduleHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scheduleHeroEyebrow: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: LOBBY.gold,
  },
  scheduleHeroLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: LOBBY.gold,
  },
  scheduleHeroLiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: LOBBY.maroon,
  },
  scheduleHeroDate: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '700',
    color: LOBBY.onMaroon,
    marginTop: 10,
    marginBottom: 2,
  },
  scheduleHeroTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 24,
  },
  scheduleHeroTimeText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: LOBBY.onMaroon,
  },
  scheduleHeroChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 14,
  },
  scheduleHeroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  scheduleHeroChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: LOBBY.onMaroon,
  },

  // EXAMINATION ACCESS PASS CARD
  accessPassCard: {
    backgroundColor: LOBBY.card,
    borderColor: LOBBY.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginTop: 12,
  },
  passHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  passHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: LOBBY.ink,
    flexShrink: 1,
  },
  passHeaderHint: {
    fontSize: 13,
    color: LOBBY.muted,
    fontWeight: '500',
  },
  qrWhiteFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LOBBY.border,
  },
  qrHint: {
    fontSize: 13,
    lineHeight: 19,
    color: LOBBY.muted,
    textAlign: 'center',
  },
  accessCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 2,
  },
  accessCodeValue: {
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 3,
    color: LOBBY.maroon,
  },
  accessCodeHint: {
    fontSize: 13,
    color: LOBBY.muted,
    textAlign: 'center',
  },
  codeSquareBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LOBBY.softFill,
  },
  passActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  passActionBtn: {
    flex: 1,
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
  list: { padding: 14, gap: 0, paddingBottom: 16 },
  headerBlock: { gap: 0, marginBottom: 8 },
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
  timerCard: {
    backgroundColor: LOBBY.card,
    borderColor: LOBBY.border,
    borderWidth: 1,
    borderRadius: 20,
    marginTop: 12,
    gap: 4,
  },
  timerCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: LOBBY.muted,
  },
  timerCardValue: {
    fontSize: 32,
    fontWeight: '700',
    color: LOBBY.maroon,
    fontVariant: ['tabular-nums'],
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
  // MONITORING — equal-width 2×2 tiles + selected-status roster
  monitoringSection: {
    backgroundColor: LOBBY.card,
    borderColor: LOBBY.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginTop: 12,
  },
  monitoringHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  monitoringSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: LOBBY.ink,
  },
  monitoringSectionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: LOBBY.muted,
    flexShrink: 1,
  },
  statusCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  statusCard: {
    // Two equal columns with enough width to stay side by side at 320dp.
    flexBasis: '48%',
    flexGrow: 0,
    minWidth: 0,
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  cardCountText: {
    fontSize: 28,
    lineHeight: 31,
    fontWeight: '700',
    marginTop: 8,
  },
  cardLabelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubtitleText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.85,
  },
  statusListBlock: {
    marginTop: 16,
    gap: 2,
  },
  statusListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    paddingBottom: 6,
  },
  statusListTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusListMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: LOBBY.muted,
    flexShrink: 1,
  },
  statusListEmpty: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: LOBBY.muted,
    paddingVertical: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 58,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: LOBBY.divider,
  },
  statusRowAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRowAvatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusRowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  statusRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: LOBBY.ink,
  },
  statusRowId: {
    fontSize: 12,
    fontWeight: '500',
    color: LOBBY.muted,
  },
  statusRowPill: {
    maxWidth: '46%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusRowPillText: {
    fontSize: 12,
    fontWeight: '700',
  },

  closeFooter: {
    paddingTop: 12,
    paddingHorizontal: 14,
    backgroundColor: LOBBY.background,
    borderTopWidth: 1,
    borderTopColor: LOBBY.divider,
  },
  // CLOSE LOBBY — fixed outlined danger button
  closeLobbyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    minHeight: 52,
    marginTop: 0,
    borderRadius: 16,
    backgroundColor: LOBBY.card,
    borderWidth: 2,
    borderColor: LOBBY.danger,
    overflow: 'hidden',
  },
  closeLobbyBtnDisabled: {
    opacity: 0.55,
  },
  closeLobbyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: LOBBY.danger,
    textAlign: 'center',
  },

  // Student detail sheet — attendance marker
  attendanceToggle: {
    minHeight: 46,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  attendanceToggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attendanceToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
 