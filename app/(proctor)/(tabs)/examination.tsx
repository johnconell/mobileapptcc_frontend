import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  Text,
  View,
  StyleSheet,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Network from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  CheckCircle2,
  Database,
  DoorOpen,
  LockKeyhole,
  LogOut,
  Search,
  X,
} from 'lucide-react-native';
import { Card, Button, EmptyState, StatusChip } from '@/shared/components/ui';
import { Skeleton, SkeletonCard } from '@/shared/components/ui/Skeleton';
import { useSkeletonLoadingTimeout } from '@/components/skeleton';
import { ProctorScheduleRow, type ScheduleEntry } from '@/features/schedules/components/ProctorScheduleRow';
import { useSchedules } from '@/features/schedules/hooks/useSchedules';
import {
  getServerClockEstimate,
  ScheduleRepository,
} from '@/features/schedules/repositories/ScheduleRepository';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QUERY_KEYS } from '@/shared/constants';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { isLocalApiMode } from '@/features/local-testing/localMode';
import { seedLocalTestData } from '@/features/local-testing/localApiStore';
import { ensureExamPackCached } from '@/features/synchronization/services/ensureExamPack';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { shadows } from '@/shared/theme';
import type { ExamSchedule, ExamSession } from '@/shared/types';
import { confirmProctorLogout } from '@/features/authentication/utils/confirmProctorLogout';
import { useHardwareBack } from '@/shared/hooks/useHardwareBack';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { userFacingError } from '@/shared/utils/userFacingError';
import { extractNumericScheduleId, matchOpenedRoom } from '@/features/schedules/utils/examScheduleStatus';
import {
  compareScheduleTimeline,
  formatManilaMonth,
  formatManilaScheduleDate,
  formatScheduleOpeningTime,
  getManilaDateIso,
  getProctorScheduleAvailability,
  getScheduleTimelinePhase,
  splitScheduleDays,
} from '@/features/schedules/utils/proctorScheduleWindow';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PackSummary = Awaited<ReturnType<typeof OfflineStore.getPackSummary>>;

type SelectedSlotDetails = {
  session: ExamSession;
  schedule: ExamSchedule;
  sidNum: number;
  roomId: number;
  roomName: string;
  capacity: number;
  isOpened: boolean;
  isEnded: boolean;
  openedCode: string;
  openedStatus: 'lobby_open' | 'in_progress' | 'ended';
};

export default function ProctorExaminationTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const queryClient = useQueryClient();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);
  const setSelectedSchedule = useProctorStore((s) => s.setSelectedSchedule);
  const setSelectedSession = useProctorStore((s) => s.setSelectedSession);
  const schedulesQuery = useSchedules(Boolean(profile));
  const [refreshing, setRefreshing] = useState(false);
  const [internetAvailable, setInternetAvailable] = useState<boolean | null>(null);
  const [pack, setPack] = useState<PackSummary | null>(null);
  const [packReadError, setPackReadError] = useState<string | null>(null);
  const [openedRooms, setOpenedRooms] = useState<
    Record<string, { code: string; openedAt: string; status: 'lobby_open' | 'in_progress' | 'ended' }>
  >({});

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Open Room Modal State
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlotDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Tracks multiple expanded schedules simultaneously
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleEntriesLoading, setScheduleEntriesLoading] = useState(false);
  const [scheduleEntriesError, setScheduleEntriesError] = useState<string | null>(null);
  const [scheduleEntriesAttempt, setScheduleEntriesAttempt] = useState(0);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [lockedSchedule, setLockedSchedule] = useState<{
    date: string;
    entries: ScheduleEntry[];
    upcoming: boolean;
  } | null>(null);
  const [showLockedDetails, setShowLockedDetails] = useState(false);
  const scheduleListRef = useRef<FlatList<{ key: string; title: string; kind: string }> | null>(null);

  const [todayStatus, setTodayStatus] = useState<{
    downloadedToday: boolean;
    packDate: string | null;
    today: string;
  }>({
    downloadedToday: false,
    packDate: null,
    today: getManilaDateIso(Date.now()),
  });
  const [packNotice, setPackNotice] = useState<{
    updateRequired: boolean;
    message: string;
    rescheduledSince: number;
    rescheduledToday: number;
    questionsChangedSince: number;
    questionsChangedToday: number;
    reason: 'reschedule' | 'questions' | 'fingerprint' | 'stale_day' | null;
  }>({
    updateRequired: false,
    message: '',
    rescheduledSince: 0,
    rescheduledToday: 0,
    questionsChangedSince: 0,
    questionsChangedToday: 0,
    reason: null,
  });

  const refreshPackData = useCallback(async () => {
    try {
      const [summary, today, rooms, status] = await Promise.all([
        OfflineStore.getPackSummary(),
        OfflineStore.isPackDownloadedToday(),
        OfflineStore.getOpenedRooms(),
        OfflineExamRepository.checkPackUpdateStatus(),
      ]);
      setPackReadError(null);
      setPack(summary);
      setTodayStatus(today);
      setOpenedRooms(rooms);
      setPackNotice({
        updateRequired: status.updateRequired || !today.downloadedToday,
        message: status.message,
        rescheduledSince: status.rescheduledSince,
        rescheduledToday: status.rescheduledToday,
        questionsChangedSince: status.questionsChangedSince,
        questionsChangedToday: status.questionsChangedToday,
        reason: status.reason,
      });
    } catch (error) {
      console.error('[EXAM SCHEDULES] Cached pack could not be read:', {
        errorName: error instanceof Error ? error.name : 'StorageError',
      });
      setPackReadError(error instanceof Error ? error.message : 'Saved examination data could not be read.');
    }
  }, []);

  useEffect(() => {
    if (!profile) {
      void AuthRepository.getCachedSessionFast().then((session) => {
        if (session) setProfile(session);
        else router.replace('/(proctor)/login' as any);
      });
    }
  }, [profile, setProfile, router]);

  useEffect(() => {
    void refreshPackData();
  }, [refreshPackData]);

  useEffect(() => {
    let active = true;
    const refreshConnection = async () => {
      const state = await Network.getNetworkStateAsync().catch(() => null);
      if (!active) return;
      if (state?.isInternetReachable === true) setInternetAvailable(true);
      else if (state?.isInternetReachable === false || state?.isConnected === false) {
        setInternetAvailable(false);
      } else {
        setInternetAvailable(null);
      }
    };
    void refreshConnection();
    const interval = setInterval(() => void refreshConnection(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClockTick((tick) => tick + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  const serverClockNowMs = useMemo(() => getServerClockEstimate(), [clockTick]);
  const scheduleNowMs = serverClockNowMs ?? Date.now();
  const todayIso = getManilaDateIso(scheduleNowMs);

  useEffect(() => {
    const schedules = schedulesQuery.data ?? [];
    let active = true;
    setScheduleEntriesLoading(schedules.length > 0);
    setScheduleEntriesError(null);
    void Promise.all(
      schedules.map(async (schedule) => {
        const sessions = await ScheduleRepository.getSessionsBySchedule(schedule.id);
        return sessions.map((session) => ({ schedule, session }));
      }),
    )
      .then((groups) => {
        if (active) {
          setScheduleEntries(groups.flat());
          setScheduleEntriesLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to load schedule time slots:', error);
        if (active) {
          setScheduleEntries([]);
          setScheduleEntriesLoading(false);
          setScheduleEntriesError('Unable to load examination time slots.');
        }
      });
    return () => {
      active = false;
    };
  }, [schedulesQuery.data, scheduleEntriesAttempt]);

  const scheduleDataLoading =
    schedulesQuery.isLoading ||
    schedulesQuery.cloudRefreshState === 'loading' ||
    (schedulesQuery.cloudRefreshState === 'checking' &&
      internetAvailable !== false &&
      !schedulesQuery.data?.length) ||
    scheduleEntriesLoading;
  const scheduleLoadingTimedOut = useSkeletonLoadingTimeout(
    scheduleDataLoading,
    10_000,
    scheduleEntriesAttempt,
  );
  const showScheduleSkeleton =
    scheduleDataLoading &&
    !scheduleLoadingTimedOut &&
    !(
      internetAvailable !== true &&
      schedulesQuery.data?.some((schedule) => schedule.offlineReady)
    );
  const scheduleLoadingError =
    scheduleLoadingTimedOut ||
    schedulesQuery.isError ||
    schedulesQuery.cloudRefreshState === 'error' ||
    Boolean(scheduleEntriesError);

  const retryScheduleLoading = () => {
    setScheduleEntriesError(null);
    setScheduleEntriesAttempt((attempt) => attempt + 1);
    void schedulesQuery.refetch();
    if (internetAvailable !== false) schedulesQuery.retryCloudRefresh();
  };

  useFocusEffect(
    useCallback(() => {
      void refreshPackData();
    }, [refreshPackData]),
  );

  useHardwareBack(() => {
    if (openModalVisible) {
      setOpenModalVisible(false);
      return true;
    }
    return false;
  });

  const downloadPack = async () => {
    setRefreshing(true);
    try {
      const currentToday = await OfflineStore.isPackDownloadedToday();
      if (currentToday.downloadedToday && internetAvailable === true) {
        const freshness = await OfflineExamRepository.checkPackUpdateStatus();
        if (!freshness.updateRequired) {
          Alert.alert('Exam Pack Up to Date', 'Your Exam Pack is already up to date.');
          await refreshPackData();
          return;
        }
      }
      const result = await ensureExamPackCached({
        force: true,
        includeAuth: true,
        allowCacheFallback: false,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
      await refreshPackData();
      const summary = await OfflineStore.getPackSummary();

      if (!result.ok) {
        Alert.alert('Download Failed', result.message);
      } else if (result.fromCache) {
        Alert.alert(
          'Using Cached Exam Pack',
          `Could not connect to the cloud server (${result.message}).\n\nExisting offline exam pack is loaded: ${summary.students} student(s) and ${summary.questions} questions.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Use for Today',
              onPress: async () => {
                await OfflineStore.markPackAcknowledgedToday();
                await refreshPackData();
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'Exam Pack Updated Successfully',
          'Exam Pack Updated Successfully. Your examination schedules, rooms, and student assignments are up to date.',
        );
      }
    } catch (error) {
      Alert.alert(
        'Download failed',
        userFacingError(
          error,
          'Unable to download the examination pack. Check your internet connection and try again.',
        ),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleSeedTestData = () => {
    Alert.alert(
      'Seed Test Examination Data',
      'This will populate a live Manila examination schedule for today (active right now), assign 15 examinees, and prepare the local offline pack for Peer LAN hosting.\n\nExisting candidate attempts will be preserved.\n\nProceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed Data',
          onPress: async () => {
            setSeeding(true);
            try {
              const res = await seedLocalTestData({
                useCurrentTimeWindow: true,
                proctorId: profile?.id ? Number(profile.id) : 901,
              });
              await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
              await schedulesQuery.refetch();
              await refreshPackData();
              Alert.alert(
                'Test Data Seeded Successfully',
                `Schedule: ${res.scheduleTitle}\nTime Window: ${res.timeSlot}\nRoom: ${res.roomName} (Cap: ${res.capacity})\nExaminees: ${res.examineesCount}\nQuestions: ${res.questionsCount}\nProctor: ${res.proctorName}\n\nThe room is ready to open immediately or host over Peer LAN.`,
              );
            } catch (err) {
              console.error('Failed to seed local test data:', {
                errorName: err instanceof Error ? err.name : 'UnknownError',
              });
              Alert.alert(
                'Seeding Failed',
                userFacingError(err, 'Unable to prepare local test data. Please try again.'),
              );
            } finally {
              setSeeding(false);
            }
          },
        },
      ],
    );
  };

  // Select a schedule first, then let the proctor choose an authorized room.
  const handleSelectTimeSlot = async (schedule: ExamSchedule, session: ExamSession) => {
    setSelectedSchedule(schedule);
    setSelectedSession(session);
    router.push({
      pathname: '/(proctor)/rooms' as any,
      params: { sessionId: session.id, scheduleId: schedule.id },
    });
  };

  // Open Room or Enter Existing Lobby
  const handleConfirmRoomAction = async () => {
    if (!selectedSlot) return;

    const availability = getProctorScheduleAvailability(
      {
        date: selectedSlot.schedule.examinationDateIso || selectedSlot.schedule.examinationDate,
        startTime: selectedSlot.session.startTime,
        endTime: selectedSlot.session.endTime,
        timeLabel: selectedSlot.session.timeLabel,
      },
      scheduleNowMs,
      todayIso,
    );
    if (!selectedSlot.isOpened && availability !== 'available') return;

    // Target route params
    const queryParams: Record<string, string> = {
      sessionId: selectedSlot.session.id,
      roomId: String(selectedSlot.roomId),
      scheduleId: String(selectedSlot.sidNum),
      roomName: selectedSlot.roomName,
      roomCode: selectedSlot.openedCode,
      roomStatus: selectedSlot.openedStatus,
    };

    // If already open, enter directly without re-initializing
    if (selectedSlot.isOpened) {
      setOpenModalVisible(false);
      router.push(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
      router.replace(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
      return;
    }

    // If already ended, go to results
    if (selectedSlot.isEnded) {
      setOpenModalVisible(false);
      router.push('/(proctor)/(tabs)/results');
      return;
    }

    // Otherwise, validate and open room
    const executeOpenRoom = async () => {
      setBusy(true);
      try {
        // 2. Wi-Fi check
        const { PeerExamClient } = await import('@/features/examinations/services/peerExamClient');
        await PeerExamClient.clear();
        const hasPack = await OfflineStore.hasPack();
        const wifiCheck = await assertCampusWifiForJoin({ requireServer: !hasPack, isProctor: true });

        if (!wifiCheck.ok) {
          Alert.alert(
            'Unable to Open Room',
            wifiCheck.message ?? 'Please connect to the examination Wi-Fi network and try again.',
          );
          return;
        }

        // 3. Ensure lobby / open room
        const snapshot = await LobbyRepository.ensureLobby(
          selectedSlot.session.id,
          undefined,
          String(selectedSlot.roomId),
        );

        // 4. Update opened rooms
        const updatedOpened = await OfflineStore.getOpenedRooms();
        setOpenedRooms(updatedOpened);

        const openedKey = `${selectedSlot.sidNum}:${selectedSlot.roomId}`;
        const newOpened = updatedOpened[openedKey];
        queryParams.roomCode = queryParams.roomCode || newOpened?.code || snapshot?.examinationCode || '';
        queryParams.roomStatus = newOpened?.status || 'lobby_open';

        setOpenModalVisible(false);
        router.push(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
        router.replace(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
      } catch (err) {
        console.error('Failed to open examination room:', {
          errorName: err instanceof Error ? err.name : 'UnknownError',
        });
        Alert.alert(
          'Unable to Open Room',
          userFacingError(err, 'Unable to open this examination room. Check the room data and local Wi-Fi, then try again.'),
        );
      } finally {
        setBusy(false);
      }
    };

    setBusy(true);
    try {
      // 1. Pack download check
      const todayCheck = await OfflineStore.isPackDownloadedToday();
      const hasPack = await OfflineStore.hasPack();

      if (!todayCheck.downloadedToday) {
        setBusy(false);
        if (hasPack) {
          Alert.alert(
            "Today's Exam Module",
            `The examination module on this device was cached on ${todayCheck.packDate ?? 'a previous session'}.\n\nWould you like to open the room with this cached module, or download the latest update?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Use Cached Pack',
                onPress: async () => {
                  await OfflineStore.markPackAcknowledgedToday();
                  await refreshPackData();
                  void executeOpenRoom();
                },
              },
              {
                text: 'Download Latest',
                onPress: () => {
                  setOpenModalVisible(false);
                  void downloadPack();
                },
              },
            ],
          );
          return;
        }

        Alert.alert(
          "Download Exam Module Required",
          `You must download today's latest examination module and passkeys before opening an examination room.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Download Now',
              onPress: () => {
                setOpenModalVisible(false);
                void downloadPack();
              },
            },
          ],
        );
        return;
      }

      void executeOpenRoom();
    } catch (err) {
      setBusy(false);
      console.error('Validation error before opening room:', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
      });
      Alert.alert(
        'Validation Error',
        userFacingError(err, 'Unable to validate the examination room setup. Please try again.'),
      );
    }
  };

  const filteredSchedules = useMemo(() => {
    const list = schedulesQuery.data ?? [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((item) => {
      const matchName = (item.name || '').toLowerCase().includes(q);
      const matchDate = (item.examinationDate || '').toLowerCase().includes(q);
      const matchVenue = (item.venue || '').toLowerCase().includes(q);
      const matchTime = (item.timeLabel || '').toLowerCase().includes(q);
      return matchName || matchDate || matchVenue || matchTime;
    });
  }, [schedulesQuery.data, searchQuery]);

  const visibleScheduleIds = useMemo(
    () => new Set(filteredSchedules.map((schedule) => schedule.id)),
    [filteredSchedules],
  );
  const visibleEntries = useMemo(
    () => scheduleEntries.filter((entry) => visibleScheduleIds.has(entry.schedule.id)),
    [scheduleEntries, visibleScheduleIds],
  );
  const dayGroups = useMemo(() => {
    const groups = new Map<string, ScheduleEntry[]>();
    for (const entry of visibleEntries) {
      const date = String(
        entry.schedule.examinationDateIso || entry.schedule.examinationDate,
      ).slice(0, 10);
      const group = groups.get(date) ?? [];
      group.push(entry);
      groups.set(date, group);
    }
    for (const group of groups.values()) {
      group.sort((a, b) =>
        compareScheduleTimeline(
          {
            date: String(a.schedule.examinationDateIso || a.schedule.examinationDate).slice(0, 10),
            startTime: a.session.startTime,
            endTime: a.session.endTime,
            timeLabel: a.session.timeLabel,
          },
          {
            date: String(b.schedule.examinationDateIso || b.schedule.examinationDate).slice(0, 10),
            startTime: b.session.startTime,
            endTime: b.session.endTime,
            timeLabel: b.session.timeLabel,
          },
          scheduleNowMs,
        ),
      );
    }
    return groups;
  }, [visibleEntries, scheduleNowMs]);

  const orderedDays = splitScheduleDays(dayGroups, todayIso);
  const todayEntries = orderedDays.today;
  const upcomingDays = orderedDays.upcoming;
  const currentMonthDays = orderedDays.currentMonthPrevious;
  const olderMonthGroups = orderedDays.previousMonths;
  const hasPreviousDays =
    currentMonthDays.length > 0 || olderMonthGroups.some(([, days]) => days.length > 0);
  const scheduleSections = useMemo(
    () => [
      { key: 'today', title: 'Today', kind: 'today' },
      { key: 'upcoming', title: 'Upcoming', kind: 'upcoming' },
      { key: 'previous', title: 'Previous Schedules', kind: 'previous' },
    ],
    [],
  );

  const lockedDayStatus = (entries: ScheduleEntry[]) =>
    entries.some(
      ({ schedule, session }) =>
        session.historyStatus === 'completed' ||
        schedule.status === 'completed' ||
        matchOpenedRoom(openedRooms, session)?.status === 'ended',
    )
      ? 'Completed'
      : 'Missed';

  const selectedAvailability = selectedSlot
    ? getProctorScheduleAvailability(
        {
          date: selectedSlot.schedule.examinationDateIso || selectedSlot.schedule.examinationDate,
          startTime: selectedSlot.session.startTime,
          endTime: selectedSlot.session.endTime,
          timeLabel: selectedSlot.session.timeLabel,
        },
        scheduleNowMs,
        todayIso,
      )
    : 'checking';
  const selectedOpenTime = selectedSlot
    ? formatScheduleOpeningTime({
        date: selectedSlot.schedule.examinationDateIso || selectedSlot.schedule.examinationDate,
        startTime: selectedSlot.session.startTime,
        timeLabel: selectedSlot.session.timeLabel,
      })
    : null;

  const toggleMonth = (month: string) => {
    setExpandedMonths((previous) => {
      const next = new Set(previous);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  const showLockedSchedule = (date: string, entries: ScheduleEntry[]) => {
    setLockedSchedule({ date, entries, upcoming: date > todayIso });
    setShowLockedDetails(false);
  };

  const lockedScheduleMessage = lockedSchedule
    ? lockedSchedule.upcoming
      ? `You can only open today's schedule (${formatManilaScheduleDate(todayIso, true)}). This schedule is for ${formatManilaScheduleDate(lockedSchedule.date)}. It will be available on that day.`
      : `You can only open today's schedule (${formatManilaScheduleDate(todayIso, true)}). This schedule is for ${formatManilaScheduleDate(lockedSchedule.date)}, so it is view only.`
    : '';

  const scheduleName = selectedSlot
    ? selectedSlot.schedule.name.replace(/Entrance\s+Examination/gi, '').trim() ||
      selectedSlot.schedule.name
    : 'Examination Schedule';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* 1. REFERENCE HEADER NAV BAR (Avatar on Left, Search/Logout on Right) */}
      <View style={[styles.navBar, { backgroundColor: colors.background }]}>
        {/* Proctor Avatar Circle */}
        <View style={[styles.navAvatarCircle, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.navAvatarText, { color: colors.textPrimary }]}>
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

        {/* Right Icon Actions: Search & Logout */}
        <View style={styles.navRightRow}>
          <Pressable
            accessibilityRole="button"
            style={[
              styles.navIconBtn,
              {
                backgroundColor: isSearchOpen ? '#7A1F2B' : colors.card,
                borderColor: isSearchOpen ? '#7A1F2B' : colors.cardBorder,
              },
            ]}
            onPress={() => setIsSearchOpen(!isSearchOpen)}
            accessibilityLabel="Search Schedules"
            hitSlop={8}
          >
            <Search size={18} color={isSearchOpen ? '#FFFFFF' : colors.textPrimary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={[styles.navIconBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            onPress={() => confirmProctorLogout()}
            accessibilityLabel="Logout"
            hitSlop={8}
          >
            <LogOut size={18} color="#7A1F2B" />
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={scheduleListRef}
        data={scheduleSections}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Screen Title Block */}
            <View style={styles.screenTitleRow}>
              <Text style={[styles.screenHeading, { color: colors.textPrimary }]}>Examination Schedules</Text>
              <Text style={[styles.screenSubheading, { color: colors.textSecondary }]}>
                {todayStatus.downloadedToday
                  ? 'Offline Pack Ready · Updated Today'
                  : pack?.ready
                    ? "Update Required for Today's Exam"
                    : 'Download Pack Required'}
              </Text>
            </View>

            <View
              style={[
                styles.connectionChip,
                { backgroundColor: internetAvailable ? colors.successMuted : colors.cardMuted },
              ]}
            >
              <View
                style={[
                  styles.connectionDot,
                  { backgroundColor: internetAvailable ? colors.success : colors.textMuted },
                ]}
              />
              <Text
                style={[
                  styles.connectionText,
                  { color: internetAvailable ? colors.success : colors.textSecondary },
                ]}
              >
                {internetAvailable
                  ? 'Online'
                  : 'Offline mode: showing downloaded schedules'}
              </Text>
            </View>

            {/* Expandable Search Input */}
            {isSearchOpen && (
              <View style={[styles.searchPillContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Search size={16} color={colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Search schedules, rooms, venues…"
                  placeholderTextColor={colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <X size={15} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            )}

            {/* COMPACT OFFLINE EXAM PACK CARD */}
            <View
              style={[
                styles.packCard,
                {
                  backgroundColor:
                    packNotice.updateRequired || !todayStatus.downloadedToday
                      ? isDark
                        ? '#1A1212'
                        : '#FFF5F5'
                      : colors.card,
                  borderColor:
                    packNotice.updateRequired || !todayStatus.downloadedToday
                      ? isDark
                        ? '#7A1F2B80'
                        : '#FECACA'
                      : colors.cardBorder,
                },
              ]}
            >
              {(packNotice.updateRequired || !todayStatus.downloadedToday) && (
                <Pressable
                  style={[
                    styles.packNoticeBtn,
                    {
                      backgroundColor: isDark ? '#2A1414' : '#FEE2E2',
                      borderColor: isDark ? '#7A1F2B70' : '#FECACA',
                    },
                  ]}
                  onPress={() =>
                    Alert.alert(
                      packNotice.reason === 'reschedule'
                        ? 'Reschedule Update Needed'
                        : packNotice.reason === 'questions'
                          ? 'Question Bank Updated'
                          : 'Update Examination Pack',
                      packNotice.message ||
                        'Tap Update Examination to refresh today\'s roster, passkeys, and questions.',
                      [
                        { text: 'Later', style: 'cancel' },
                        { text: 'Update Now', onPress: () => void downloadPack() },
                      ],
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Pack update notification"
                >
                  <View style={styles.packNoticeIcon}>
                    <Bell size={16} color="#DC2626" />
                    {(packNotice.rescheduledSince > 0 ||
                      packNotice.rescheduledToday > 0 ||
                      packNotice.questionsChangedSince > 0 ||
                      packNotice.questionsChangedToday > 0) && (
                      <View style={styles.packNoticeBadge}>
                        <Text style={styles.packNoticeBadgeText}>
                          {Math.min(
                            99,
                            packNotice.rescheduledSince ||
                              packNotice.rescheduledToday ||
                              packNotice.questionsChangedSince ||
                              packNotice.questionsChangedToday,
                          )}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.packNoticeTitle, { color: isDark ? '#FECACA' : '#991B1B' }]}>
                      {packNotice.reason === 'reschedule' || packNotice.rescheduledSince > 0
                        ? 'Students were rescheduled'
                        : packNotice.reason === 'questions' ||
                            packNotice.questionsChangedSince > 0
                          ? 'Questions were added or updated'
                          : !todayStatus.downloadedToday
                            ? 'Exam pack update required'
                            : 'Examination pack changed'}
                    </Text>
                    <Text
                      style={[styles.packNoticeBody, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}
                      numberOfLines={2}
                    >
                      {packNotice.message ||
                        'Tap Update Examination below to refresh the latest applicants, passkeys, and questions.'}
                    </Text>
                  </View>
                </Pressable>
              )}

              <View style={styles.packRow}>
                <View
                  style={[
                    styles.packIconWrap,
                    todayStatus.downloadedToday && !packNotice.updateRequired
                      ? { backgroundColor: isDark ? '#142918' : '#DCFCE7' }
                      : { backgroundColor: isDark ? '#2A1414' : '#FEE2E2' },
                  ]}
                >
                  {todayStatus.downloadedToday && !packNotice.updateRequired ? (
                    <CheckCircle2 size={18} color={isDark ? '#22C55E' : '#16A34A'} />
                  ) : (
                    <AlertTriangle size={18} color={isDark ? '#F87171' : '#DC2626'} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.packTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {todayStatus.downloadedToday
                      ? packNotice.updateRequired
                        ? 'Update Exam Pack'
                        : "Today's Exam Pack Ready"
                      : (pack?.questions ?? 0) > 0
                        ? 'Cached Exam Pack Ready'
                        : 'Download Exam Pack'}
                  </Text>
                  <Text style={[styles.packSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {todayStatus.downloadedToday
                      ? packNotice.updateRequired
                        ? 'Refresh now so rescheduled applicants and updated questions appear in your rooms.'
                        : `Updated Today (${todayStatus.today}) · ${pack?.students ?? 0} students · ${pack?.questions ?? 0} questions`
                      : (pack?.questions ?? 0) > 0
                        ? `Cached (${todayStatus.packDate ?? 'Saved'}) · ${pack?.students ?? 0} students · ${pack?.questions ?? 0} questions`
                        : "Download today's passkeys and latest module to include rescheduled applicants and new questions."}
                  </Text>
                  {pack?.packRevision != null ? (
                    <Text style={[styles.packSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      Exam Pack revision {pack.packRevision}
                      {pack.lastUpdatedAt ? ` · Last updated ${new Date(pack.lastUpdatedAt).toLocaleString()}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>

              {packReadError ? (
                <Text style={[styles.packSub, { color: isDark ? '#FCA5A5' : '#991B1B' }]} accessibilityRole="alert">
                  {packReadError} Refresh to retry; saved data was preserved.
                </Text>
              ) : null}

              <View style={styles.packActionsRow}>
                <Button
                  title={
                    refreshing
                      ? 'Updating…'
                      : todayStatus.downloadedToday || (pack?.questions ?? 0) > 0
                        ? 'Update Exam Pack'
                        : 'Download Examination'
                  }
                  variant="primary"
                  size="md"
                  loading={refreshing}
                  disabled={seeding}
                  onPress={() => void downloadPack()}
                  style={styles.packUpdateBtn}
                />
                {isLocalApiMode() && (
                  <Button
                    title={seeding ? 'Seeding…' : 'Seed Test Data'}
                    variant="outline"
                    size="md"
                    loading={seeding}
                    disabled={refreshing || seeding}
                    icon={<Database size={16} color={colors.accent} />}
                    onPress={handleSeedTestData}
                    style={styles.seedDataBtn}
                  />
                )}
              </View>
            </View>

            <View style={[styles.legendContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.intro, { color: colors.textSecondary }]}>
                Open Room is available only for today&apos;s schedule. Other dates are locked and view only.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          schedulesQuery.isLoading || schedulesQuery.cloudRefreshState === 'loading' ? null : searchQuery ? (
            <EmptyState title="No matching schedules found" />
          ) : !internetAvailable ? (
            <View style={styles.offlineEmptyState}>
              <Text style={[styles.offlineEmptyText, { color: colors.textSecondary }]}>
                No schedules downloaded. Connect to the internet and download today&apos;s exam pack.
              </Text>
              <Button
                title="Retry"
                variant="outline"
                onPress={retryScheduleLoading}
              />
            </View>
          ) : (
            <EmptyState title="No examination schedules available" />
          )
        }
        renderItem={({ item: section }) => {
          if (section.kind === 'today') {
            return (
              <View style={styles.scheduleSection}>
                <Text style={[styles.scheduleSectionTitle, { color: colors.textPrimary }]}>
                  Today&apos;s Schedule
                </Text>
                {todayIso ? (
                  <Text style={[styles.scheduleSectionDate, { color: colors.textSecondary }]}>
                    {formatManilaScheduleDate(todayIso, true)}
                  </Text>
                ) : null}
                {scheduleLoadingError ? (
                  <View style={styles.scheduleLoadError}>
                    <Text style={[styles.scheduleSectionEmpty, { color: colors.textSecondary }]}>
                      {scheduleEntriesError ||
                        (scheduleLoadingTimedOut
                          ? 'Loading schedules took too long.'
                          : 'Unable to load examination schedules.')}
                    </Text>
                    <Button title="Retry" variant="outline" onPress={retryScheduleLoading} />
                  </View>
                ) : showScheduleSkeleton ? (
                  <View style={styles.scheduleSkeletonGroup}>
                    {[0, 1].map((item) => (
                      <SkeletonCard
                        key={item}
                        style={[
                          styles.scheduleSkeletonCard,
                          { backgroundColor: colors.card, borderColor: colors.cardBorder },
                        ]}
                      >
                        <View style={styles.scheduleSkeletonTop}>
                          <Skeleton height={17} width="42%" />
                          <Skeleton height={22} width={58} radius={12} />
                        </View>
                        <View style={styles.scheduleSkeletonMiddle}>
                          <Skeleton height={13} width="30%" />
                          <Skeleton height={13} width="35%" />
                        </View>
                        <View style={styles.scheduleSkeletonBottom}>
                          <Skeleton height={12} width="25%" />
                          <Skeleton height={36} width={110} radius={10} />
                        </View>
                      </SkeletonCard>
                    ))}
                  </View>
                ) : todayEntries.length ? (
                  todayEntries.map((entry, index) => {
                    const opened = matchOpenedRoom(openedRooms, entry.session);
                    const displayEntry = {
                      ...entry,
                      session: { ...entry.session, status: opened?.status ?? entry.session.status },
                    };
                    const availability = getProctorScheduleAvailability(
                      {
                        date: todayIso,
                        startTime: entry.session.startTime,
                        endTime: entry.session.endTime,
                        timeLabel: entry.session.timeLabel,
                      },
                      scheduleNowMs,
                      todayIso,
                    );
                    const phase = getScheduleTimelinePhase(
                      {
                        date: todayIso,
                        startTime: entry.session.startTime,
                        endTime: entry.session.endTime,
                        timeLabel: entry.session.timeLabel,
                      },
                      scheduleNowMs,
                    );
                    return (
                      <ProctorScheduleRow
                        key={`${entry.schedule.id}:${entry.session.id}:${index}`}
                        entry={displayEntry}
                        dateLabel={todayIso}
                        mode="today"
                        availability={availability}
                        status={opened?.status === 'in_progress' ? 'In progress' : opened?.status === 'lobby_open' ? 'Lobby open' : phase === 'completed' ? 'Ended' : phase === 'active' ? 'In progress' : 'Scheduled'}
                        onOpen={() => void handleSelectTimeSlot(entry.schedule, entry.session)}
                      />
                    );
                  })
                ) : (
                  <Text style={[styles.scheduleSectionEmpty, { color: colors.textSecondary }]}>
                    No examination scheduled today.
                  </Text>
                )}
              </View>
            );
          }

          if (section.kind === 'upcoming') {
            return (
              <View style={styles.scheduleSection}>
                {upcomingDays.length ? (
                  <>
                    <Text style={[styles.scheduleSectionTitle, { color: colors.textPrimary }]}>
                      Upcoming
                    </Text>
                    {upcomingDays.map(([date, entries]) => (
                      <ProctorScheduleRow
                        key={date}
                        entries={entries}
                        dateLabel={formatManilaScheduleDate(date)}
                        mode="locked"
                        badge="Not today"
                        onLockedPress={() => showLockedSchedule(date, entries)}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            );
          }

          return (
            <View style={styles.scheduleSection}>
              {showScheduleSkeleton && !scheduleLoadingError ? (
                <>
                  <Text style={[styles.scheduleSectionTitle, { color: colors.textPrimary }]}>
                    Previous Schedules
                  </Text>
                  <View style={styles.previousSkeletonRows}>
                    {[0, 1, 2].map((item) => (
                      <View key={item} style={styles.previousSkeletonRow}>
                        <Skeleton height={14} width="42%" />
                        <Skeleton height={12} width="27%" />
                        <Skeleton height={12} width={48} radius={10} />
                      </View>
                    ))}
                  </View>
                </>
              ) : hasPreviousDays ? (
                <>
                  <Text style={[styles.scheduleSectionTitle, { color: colors.textPrimary }]}>
                    Previous Schedules
                  </Text>
                  {currentMonthDays.map(([date, entries]) => (
                    <ProctorScheduleRow
                      key={date}
                      entries={entries}
                      dateLabel={formatManilaScheduleDate(date)}
                      mode="locked"
                      status={lockedDayStatus(entries)}
                      onLockedPress={() => showLockedSchedule(date, entries)}
                    />
                  ))}
                  {olderMonthGroups.map(([month, days]) => {
                      const expanded = expandedMonths.has(month);
                      return (
                        <View key={month} style={styles.monthGroup}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ expanded }}
                            onPress={() => toggleMonth(month)}
                            style={[
                              styles.monthHeader,
                              { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                            ]}
                          >
                            <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
                              {formatManilaMonth(`${month}-01`)}
                            </Text>
                            <ChevronDown
                              size={19}
                              color={colors.textSecondary}
                              style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                            />
                          </Pressable>
                          {expanded
                            ? days
                                .sort(([a], [b]) => b.localeCompare(a))
                                .map(([date, entries]) => (
                                  <ProctorScheduleRow
                                    key={date}
                                    entries={entries}
                                    dateLabel={formatManilaScheduleDate(date)}
                                    mode="locked"
                                    status={lockedDayStatus(entries)}
                                    onLockedPress={() => showLockedSchedule(date, entries)}
                                  />
                                ))
                            : null}
                        </View>
                      );
                    })}
                </>
              ) : null}
            </View>
          );
        }}
      />

      {/* OPEN EXAMINATION ROOM DIRECT MODAL */}
      <Modal
        visible={openModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !busy && setOpenModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !busy && setOpenModalVisible(false)}
          />

          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconWrap,
                  selectedSlot?.isOpened && styles.modalIconWrapOpened,
                  selectedSlot?.isEnded && styles.modalIconWrapEnded,
                ]}
              >
                <DoorOpen
                  size={22}
                  color={
                    selectedSlot?.isOpened
                      ? '#22C55E'
                      : selectedSlot?.isEnded
                        ? '#71717A'
                        : '#7A1F2B'
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {selectedSlot?.isOpened
                    ? 'Enter Examination Lobby'
                    : selectedSlot?.isEnded || selectedAvailability === 'ended'
                      ? 'Examination Ended'
                      : 'Open Examination Room'}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  {selectedSlot?.isOpened
                    ? 'Room is currently active and broadcasting'
                    : selectedSlot?.isEnded || selectedAvailability === 'ended'
                      ? 'This session has ended and is closed'
                      : selectedAvailability === 'checking'
                        ? 'Checking the official schedule time'
                      : 'Confirm details to launch the lobby'}
                </Text>
              </View>
            </View>

            {/* DETAIL TABLE */}
            <View style={[styles.detailTable, { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder }]}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Room</Text>
                <Text style={[styles.detailValueBold, { color: colors.textPrimary }]}>
                  {selectedSlot?.roomName || 'Room 101'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Schedule</Text>
                <Text style={[styles.detailValue, { color: colors.textSecondary }]}>
                  {scheduleName}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Time</Text>
                <Text style={[styles.detailValue, { color: colors.textSecondary }]}>
                  {selectedSlot?.session.timeLabel || '9:30 AM - 10:30 AM'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Capacity</Text>
                <Text style={[styles.detailValue, { color: colors.textSecondary }]}>
                  {selectedSlot?.capacity ?? 60} Applicants
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status</Text>
                <StatusChip
                  label={
                    selectedSlot?.isOpened
                      ? selectedSlot?.openedStatus === 'in_progress'
                        ? 'In Progress'
                        : 'Lobby Open'
                      : selectedSlot?.isEnded
                        ? 'Ended'
                        : 'Not opened'
                  }
                  tone={
                    selectedSlot?.isOpened
                      ? 'success'
                      : selectedSlot?.isEnded
                        ? 'danger'
                        : 'default'
                  }
                />
              </View>
            </View>

            <Text style={[styles.modalNotice, { backgroundColor: colors.cardMuted, color: colors.textSecondary }]}>
              {selectedSlot?.isOpened
                ? 'This room is currently open and broadcasting. Tap Enter Lobby to manage the active session.'
                : selectedSlot?.isEnded || selectedAvailability === 'ended'
                  ? 'This examination time slot has ended. Retakes and duplicate sessions are prohibited. Tap View Results to inspect submissions.'
                  : selectedAvailability === 'too_early' && selectedOpenTime
                    ? `Opening is available at ${selectedOpenTime}.`
                    : selectedAvailability === 'checking'
                      ? 'The app is waiting for the server clock before enabling room access.'
                  : 'Opening this room will generate the examination QR code, start the local Wi-Fi peer server, and allow examinees to enter the lobby.'}
            </Text>

            {/* MODAL ACTIONS: [Cancel/Close] [Enter Lobby / Open Room / View Results] */}
            <View style={styles.modalActions}>
              <Button
                title={selectedSlot?.isEnded ? 'Close' : 'Cancel'}
                variant="outline"
                disabled={busy}
                onPress={() => setOpenModalVisible(false)}
                style={{ flex: 1, borderColor: colors.cardBorder, backgroundColor: colors.cardMuted }}
              />
              <Button
                title={
                  selectedSlot?.isOpened
                    ? 'Enter Lobby'
                    : selectedSlot?.isEnded || selectedAvailability === 'ended'
                      ? 'Ended'
                      : selectedAvailability === 'too_early' && selectedOpenTime
                        ? `Opens at ${selectedOpenTime}`
                        : selectedAvailability === 'checking'
                          ? 'Checking time…'
                          : selectedAvailability === 'not_available'
                            ? 'Not available yet'
                            : 'Open Room'
                }
                variant="primary"
                loading={busy}
                disabled={
                  Boolean(selectedSlot?.isEnded) ||
                  (!selectedSlot?.isOpened && selectedAvailability !== 'available')
                }
                onPress={handleConfirmRoomAction}
                style={{
                  flex: 1,
                  backgroundColor: selectedSlot?.isEnded ? '#222222' : '#7A1F2B',
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(lockedSchedule)}
        transparent
        animationType="slide"
        onRequestClose={() => setLockedSchedule(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setLockedSchedule(null)}
          />
          <View style={[styles.lockedModalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.lockedModalTitleRow}>
              <LockKeyhole size={21} color={isDark ? '#D7BC7A' : '#80621F'} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Can&apos;t open this schedule
              </Text>
            </View>
            <Text style={[styles.lockedModalBody, { color: colors.textSecondary }]}>
              {lockedScheduleMessage}
            </Text>

            {showLockedDetails && lockedSchedule ? (
              <View style={[styles.lockedDetails, { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder }]}>
                <Text style={[styles.lockedDetailsTitle, { color: colors.textPrimary }]}>
                  Batches and students
                </Text>
                <FlatList
                  data={lockedSchedule.entries}
                  keyExtractor={(item, index) => `${item.schedule.id}:${item.session.id}:${index}`}
                  style={styles.lockedDetailsList}
                  renderItem={({ item }) => (
                    <View style={styles.lockedDetailsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.lockedDetailsPrimary, { color: colors.textPrimary }]}>
                          {item.session.timeLabel}
                        </Text>
                        <Text style={[styles.lockedDetailsSecondary, { color: colors.textSecondary }]}>
                          {item.session.batchNumber}
                        </Text>
                      </View>
                      <Text style={[styles.lockedDetailsSecondary, { color: colors.textSecondary }]}>
                        {item.session.registeredStudents} students
                      </Text>
                    </View>
                  )}
                />
              </View>
            ) : null}

            <View style={styles.lockedModalActions}>
              <Button
                title={showLockedDetails ? 'Hide details' : 'View details'}
                variant="outline"
                onPress={() => setShowLockedDetails((visible) => !visible)}
                style={[styles.lockedModalButton, { borderColor: colors.cardBorder }]}
              />
              <Button
                title="Go to today’s schedule"
                variant="primary"
                onPress={() => {
                  setLockedSchedule(null);
                  scheduleListRef.current?.scrollToIndex({ index: 0, animated: true });
                }}
                style={[styles.lockedModalButton, { backgroundColor: '#7A1F2B' }]}
              />
              <Button
                title="OK"
                variant="outline"
                onPress={() => setLockedSchedule(null)}
                style={[styles.lockedModalButton, { borderColor: colors.cardBorder }]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  navRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  list: {
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 12,
    paddingBottom: 100,
  },
  scheduleSection: {
    gap: 10,
    marginBottom: 12,
  },
  scheduleSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.25,
    marginHorizontal: 2,
  },
  scheduleSectionDate: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 2,
    marginTop: -7,
  },
  scheduleSectionEmpty: {
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  scheduleSkeletonGroup: {
    gap: 10,
  },
  scheduleSkeletonCard: {
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 10,
  },
  scheduleSkeletonTop: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleSkeletonMiddle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  scheduleSkeletonBottom: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previousSkeletonRows: {
    gap: 10,
  },
  previousSkeletonRow: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  scheduleLoadError: {
    gap: 8,
    alignItems: 'flex-start',
  },
  monthGroup: {
    gap: 8,
  },
  monthHeader: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  lockedModalCard: {
    width: '92%',
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 14,
    alignSelf: 'center',
  },
  lockedModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockedModalBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  lockedDetails: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    maxHeight: 210,
  },
  lockedDetailsTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  lockedDetailsList: {
    flexGrow: 0,
  },
  lockedDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#88888855',
    paddingVertical: 8,
    gap: 8,
  },
  lockedDetailsPrimary: {
    fontSize: 13,
    fontWeight: '700',
  },
  lockedDetailsSecondary: {
    fontSize: 12,
    fontWeight: '600',
  },
  lockedModalActions: {
    gap: 8,
  },
  lockedModalButton: {
    minHeight: 42,
  },
  headerBlock: {
    gap: 14,
    marginBottom: 6,
  },
  screenTitleRow: {
    marginBottom: 2,
  },
  connectionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  offlineEmptyState: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  offlineEmptyText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  screenHeading: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  screenSubheading: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  searchPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  packCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    ...shadows.card,
  },
  packNoticeBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  packNoticeIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packNoticeBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  packNoticeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  packNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  packNoticeBody: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  packCardWarning: {
    borderColor: '#7A1F2B50',
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  packIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packIconWrapReady: {
    backgroundColor: '#142918',
  },
  packIconWrapWarning: {
    backgroundColor: '#2A1414',
  },
  packTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  packSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A1A1AA',
    lineHeight: 16,
  },
  packActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  packUpdateBtn: {
    backgroundColor: '#7A1F2B',
    borderColor: '#7A1F2B',
    flex: 1,
    minWidth: 150,
    minHeight: 48,
  },
  seedDataBtn: {
    flex: 1,
    minWidth: 150,
    minHeight: 48,
  },
  legendContainer: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 2,
  },
  intro: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    paddingVertical: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDotIdle: {
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#52525B',
  },
  legendDotOpen: {
    backgroundColor: '#7A1F2B',
  },
  legendDotProgress: {
    backgroundColor: '#3B82F6',
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '700',
  },

  // DIRECT ROOM MODAL STYLING
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    gap: 16,
    ...shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#2A1414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIconWrapOpened: {
    backgroundColor: '#142918',
  },
  modalIconWrapEnded: {
    backgroundColor: '#1E1E1E',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  detailTable: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4D4D8',
    flexShrink: 1,
    textAlign: 'right',
  },
  detailValueBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalNotice: {
    fontSize: 11,
    color: '#A1A1AA',
    lineHeight: 16,
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 10,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
