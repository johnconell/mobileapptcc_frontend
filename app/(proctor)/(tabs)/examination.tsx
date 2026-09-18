import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  DoorOpen,
  LogOut,
  Search,
  X,
} from 'lucide-react-native';
import { Card, Button, EmptyState, Breadcrumbs, StatusChip } from '@/shared/components/ui';
import { ScheduleCard } from '@/features/schedules/components/ScheduleCard';
import { useSchedules } from '@/features/schedules/hooks/useSchedules';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QUERY_KEYS } from '@/shared/constants';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { ensureExamPackCached } from '@/features/synchronization/services/ensureExamPack';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { shadows } from '@/shared/theme';
import type { ExamSchedule, ExamSession } from '@/shared/types';
import { confirmProctorLogout } from '@/features/authentication/utils/confirmProctorLogout';
import { useHardwareBack } from '@/shared/hooks/useHardwareBack';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { extractNumericScheduleId, matchOpenedRoom } from '@/features/schedules/utils/examScheduleStatus';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function LegendSwatch({
  tone,
  label,
}: {
  tone: 'idle' | 'open' | 'progress' | 'ended';
  label: string;
}) {
  const { colors, isDark } = useAppTheme();
  return (
    <View style={styles.legendItem}>
      {tone === 'ended' ? (
        <CheckCircle2 size={12} color={isDark ? '#22C55E' : '#16A34A'} strokeWidth={2.4} />
      ) : (
        <View
          style={[
            styles.legendDot,
            tone === 'open' && styles.legendDotOpen,
            tone === 'progress' && styles.legendDotProgress,
            tone === 'idle' && {
              backgroundColor: isDark ? '#262626' : '#D4CBB8',
              borderWidth: 1,
              borderColor: isDark ? '#52525B' : '#B8AC98',
            },
          ]}
        />
      )}
      <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
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
  const [pack, setPack] = useState<PackSummary | null>(null);
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

  // Tracks multiple expanded schedules simultaneously
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<Set<string>>(new Set());

  const [todayStatus, setTodayStatus] = useState<{
    downloadedToday: boolean;
    packDate: string | null;
    today: string;
  }>({
    downloadedToday: false,
    packDate: null,
    today: new Date().toISOString().slice(0, 10),
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
    const [summary, today, rooms, status] = await Promise.all([
      OfflineStore.getPackSummary(),
      OfflineStore.isPackDownloadedToday(),
      OfflineStore.getOpenedRooms(),
      OfflineExamRepository.checkPackUpdateStatus(),
    ]);
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
  }, []);

  useEffect(() => {
    if (!profile) {
      void AuthRepository.getSession().then((session) => {
        if (session) setProfile(session);
        else router.replace('/(proctor)/login' as any);
      });
    }
  }, [profile, setProfile, router]);

  useEffect(() => {
    void refreshPackData();
  }, [refreshPackData]);

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
      const result = await ensureExamPackCached({
        force: true,
        includeAuth: true,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.schedules });
      await refreshPackData();
      const summary = await OfflineStore.getPackSummary();
      Alert.alert(
        result.ok ? "Today's Exam Pack Ready" : 'Download Failed',
        result.ok
          ? `${summary.students} student(s) and ${summary.questions} questionnaire items cached for today. Your proctor session is included so this phone can stay offline afterward.`
          : result.message,
      );
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSchedule = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // When proctor clicks an examination time slot, DIRECTLY open the room modal
  const handleSelectTimeSlot = async (schedule: ExamSchedule, session: ExamSession) => {
    setSelectedSchedule(schedule);
    setSelectedSession(session);

    // Resolve room and schedule numeric ID
    // Resolve room and schedule numeric ID from session.id
    const offlinePack = await OfflineStore.getPack();
    const sidNum = extractNumericScheduleId(session.id, session.scheduleId);
    const cleanSess = String(session.id).replace(/^offline-/, '');

    const schedMatch = (offlinePack?.schedules ?? []).find((row) => {
      if (sidNum && Number(row.id) === sidNum) return true;
      return String(row.id) === cleanSess.split('-')[0];
    });
    const roomObj = schedMatch?.rooms?.[0];
    const roomId = Number(session.roomId || roomObj?.id || 0) || 1;
    const roomName = session.roomName || roomObj?.room_name || session.venue || 'Room 101';
    const adminRoomLimit = Number(offlinePack?.examination_settings?.room_student_limit);
    const capacity =
      Number.isInteger(adminRoomLimit) && adminRoomLimit >= 1
        ? adminRoomLimit
        : (roomObj?.capacity ?? 60);

    const currentOpened = await OfflineStore.getOpenedRooms();
    setOpenedRooms(currentOpened);

    const matchingEntry = matchOpenedRoom(currentOpened, {
      id: session.id,
      scheduleId: session.scheduleId,
      roomId: session.roomId ?? (roomObj?.id != null ? String(roomObj.id) : null),
    });

    const isOpened = Boolean(
      matchingEntry && (matchingEntry.status === 'lobby_open' || matchingEntry.status === 'in_progress'),
    );
    const isEnded = Boolean(matchingEntry && matchingEntry.status === 'ended');

    setSelectedSlot({
      schedule,
      session,
      sidNum: sidNum ?? (Number(cleanSess.split('-')[0]) || 0),
      roomId,
      roomName,
      capacity,
      isOpened,
      isEnded,
      openedCode: matchingEntry?.code || '',
      openedStatus: matchingEntry?.status || 'lobby_open',
    });

    setOpenModalVisible(true);
  };

  // Open Room or Enter Existing Lobby
  const handleConfirmRoomAction = async () => {
    if (!selectedSlot) return;

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
    setBusy(true);
    try {
      // 1. Pack download check
      const todayCheck = await OfflineStore.isPackDownloadedToday();
      if (!todayCheck.downloadedToday) {
        Alert.alert(
          "Download Today's Exam Module",
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
      queryParams.roomCode = newOpened?.code || snapshot?.examinationCode || '';
      queryParams.roomStatus = newOpened?.status || 'lobby_open';

      setOpenModalVisible(false);
      router.push(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
      router.replace(`/(proctor)/lobby?${new URLSearchParams(queryParams).toString()}` as any);
    } catch (err) {
      console.error('Failed to open examination room:', err);
      Alert.alert(
        'Unable to Open Room',
        err instanceof Error ? err.message : 'Please check your connection and try again.',
      );
    } finally {
      setBusy(false);
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
        data={filteredSchedules}
        keyExtractor={(item) => item.id}
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
                        ? 'Update Examination Pack'
                        : "Today's Exam Pack Ready"
                      : 'Download Exam Pack'}
                  </Text>
                  <Text style={[styles.packSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {todayStatus.downloadedToday
                      ? packNotice.updateRequired
                        ? 'Refresh now so rescheduled applicants and updated questions appear in your rooms.'
                        : `Updated Today (${todayStatus.today}) · ${pack?.students ?? 0} students · ${pack?.questions ?? 0} questions`
                      : "Download today's passkeys and latest module to include rescheduled applicants and new questions."}
                  </Text>
                </View>
              </View>

              <Button
                title={
                  refreshing
                    ? 'Updating…'
                    : todayStatus.downloadedToday
                      ? 'Update Examination'
                      : 'Download Examination'
                }
                variant="primary"
                size="md"
                loading={refreshing}
                onPress={() => void downloadPack()}
                style={styles.packUpdateBtn}
              />
            </View>

            <View style={[styles.legendContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.intro, { color: colors.textSecondary }]}>
                Tap a schedule to see its time slots. Select any slot to open room or inspect lobby.
              </Text>
              <View style={styles.legend}>
                <LegendSwatch tone="idle" label="Not opened" />
                <LegendSwatch tone="open" label="Lobby open" />
                <LegendSwatch tone="progress" label="In progress" />
                <LegendSwatch tone="ended" label="Ended" />
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={searchQuery ? 'No matching schedules found' : 'No examination schedules available'}
          />
        }
        renderItem={({ item, index }) => (
          <ScheduleCard
            schedule={item}
            delay={index * 60}
            isExpanded={expandedScheduleIds.has(item.id)}
            onToggle={() => toggleSchedule(item.id)}
            onSelectTimeSlot={(session) => void handleSelectTimeSlot(item, session)}
            openedRooms={openedRooms}
          />
        )}
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
                    : selectedSlot?.isEnded
                      ? 'Examination Completed'
                      : 'Open Examination Room'}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  {selectedSlot?.isOpened
                    ? 'Room is currently active and broadcasting'
                    : selectedSlot?.isEnded
                      ? 'This session has ended and is closed'
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
                : selectedSlot?.isEnded
                  ? 'This examination time slot has ended. Retakes and duplicate sessions are prohibited. Tap View Results to inspect submissions.'
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
                    : selectedSlot?.isEnded
                      ? 'View Results'
                      : 'Open Room'
                }
                variant="primary"
                loading={busy}
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
  headerBlock: {
    gap: 14,
    marginBottom: 6,
  },
  screenTitleRow: {
    marginBottom: 2,
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
  packUpdateBtn: {
    backgroundColor: '#7A1F2B',
    borderColor: '#7A1F2B',
    alignSelf: 'stretch',
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
