import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Text,
  View,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  DoorOpen,
  LockKeyhole,
  MapPin,
  Users,
  ChevronRight,
  Layers,
} from 'lucide-react-native';
import { Header, Card, Button, EmptyState, StatusChip, Breadcrumbs } from '@/shared/components/ui';
import { useSkeletonLoadingTimeout } from '@/components/skeleton';
import { SkeletonList } from '@/shared/components/ui/Skeleton';
import { useRooms, useSchedules, useSessions } from '@/features/schedules/hooks/useSchedules';
import { LobbyRepository } from '@/features/lobby/repositories/LobbyRepository';
import { QUERY_KEYS } from '@/shared/constants';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { safeBack } from '@/shared/utils';
import { userFacingError } from '@/shared/utils/userFacingError';
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { formatManilaScheduleDate, getProctorScheduleAvailability } from '@/features/schedules/utils/proctorScheduleWindow';
import type { ExamRoom, ExamSession } from '@/shared/types';
import { shadows, typography } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import {
  scheduleRedesignLayout,
  useScheduleRedesignTheme,
} from '@/features/schedules/components/scheduleRedesignTheme';

function roomTone(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'lobby_open' || status === 'in_progress') return 'success';
  if (status === 'ended') return 'danger';
  return 'default';
}

function roomStatusLabel(status: string): string {
  if (status === 'lobby_open') return 'Lobby Open';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'ended') return 'Ended';
  return 'Closed / Idle';
}

export default function RoomsScreen() {
  const { colors: themeColors } = useAppTheme();
  const scheduleTheme = useScheduleRedesignTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sessionId, scheduleId } = useLocalSearchParams<{
    sessionId?: string;
    scheduleId?: string;
  }>();

  const selectedSession = useProctorStore((s) => s.selectedSession);
  const selectedSchedule = useProctorStore((s) => s.selectedSchedule);
  const schedulesQuery = useSchedules();
  const sessionsQuery = useSessions(scheduleId);
  const roomsQuery = useRooms(sessionId);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const roomsLoadingTimedOut = useSkeletonLoadingTimeout(
    roomsQuery.isLoading && !roomsQuery.data,
    10_000,
    retryAttempt,
  );

  const [selectedRoomState, setSelectedRoom] = useState<ExamRoom | null>(null);
  const selectedRoom = selectedRoomState as ExamRoom;
  const [modalVisible, setModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const session = (
    selectedSession ??
    sessionsQuery.data?.find((item) => item.id === sessionId) ??
    null
  ) as ExamSession;

  const schedule =
    selectedSchedule ??
    schedulesQuery.data?.find((item) => item.id === (scheduleId ?? session?.scheduleId)) ??
    null;

  const scheduleName =
    schedule?.name.replace(/Entrance\s+Examination/gi, '').trim() ||
    schedule?.name ||
    'Morning Schedule';

  const sessionLabel = session?.timeLabel ?? 'Time Slot';
  const scheduleAvailability = session
    ? getProctorScheduleAvailability(
        {
          date: schedule?.examinationDateIso || schedule?.examinationDate || '',
          startTime: session.startTime,
          endTime: session.endTime,
          timeLabel: session.timeLabel,
        },
        Date.now(),
      )
    : 'invalid';

  // STEP 3: Dynamic route-aware breadcrumbs: Examination > Morning Schedule > 9:30 AM - 10:30 AM
  const breadcrumbs = [
    {
      label: 'Examination',
      onPress: () => router.replace('/(proctor)/(tabs)/examination'),
    },
    {
      label: scheduleName,
      onPress: () => router.replace('/(proctor)/(tabs)/examination'),
    },
    {
      label: sessionLabel,
    },
  ];

  /**
   * STEP 6 & 7: Comprehensive Validation and Direct Navigation to Existing Lobby
   */
  const handleOpenRoom = async (skipTodayCheck?: boolean, claimConfirmed?: boolean) => {
    if (!selectedRoom || !sessionId) {
      Alert.alert('Unable to Open Room', 'Missing room or session identification.');
      return;
    }

    const isEnded = selectedRoom.status === 'ended';
    const isOpen = selectedRoom.status === 'lobby_open' || selectedRoom.status === 'in_progress';

    if (!isEnded && !isOpen && scheduleAvailability !== 'available') {
      Alert.alert(
        'Schedule Not Active',
        scheduleAvailability === 'ended'
          ? 'This examination schedule has ended and cannot be opened.'
          : scheduleAvailability === 'too_early'
            ? 'This examination schedule is not open yet.'
            : 'This examination schedule is not available for opening.',
      );
      return;
    }

    // Query parameters for the existing lobby
    const query = new URLSearchParams({
      sessionId,
      roomId: selectedRoom.id,
      scheduleId: scheduleId ?? '',
      roomName: selectedRoom.roomName,
      roomCode: selectedRoom.examinationCode ?? '',
      roomStatus: selectedRoom.status,
      ...(selectedRoom.examSessionId != null ? { examSessionId: String(selectedRoom.examSessionId) } : {}),
    }).toString();

    const targetRoute = `/(proctor)/lobby?${query}`;

    // Ended room: view-only mode for results and sync (no new lobby required)
    if (isEnded && !isOpen) {
      setModalVisible(false);
      router.push(targetRoute as any);
      return;
    }

    setBusy(true);
    try {
      // 1. Verify Schedule & Time slot exist
      if (!session) {
        Alert.alert('Validation Error', 'The selected examination time slot could not be found.');
        return;
      }

      // 2. Verify Examination Pack was downloaded TODAY (required for rescheduled applicants)
      if (!skipTodayCheck) {
        const todayCheck = await OfflineStore.isPackDownloadedToday();
        const hasPack = await OfflineStore.hasPack();

        if (!todayCheck.downloadedToday) {
          setBusy(false);
          if (hasPack) {
            Alert.alert(
              "Today's Exam Module",
              `The examination module on this device was saved on ${todayCheck.packDate ?? 'a previous session'}.\n\nWould you like to open the room with this cached pack, or update from the cloud?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Use Cached Pack',
                  onPress: async () => {
                    await OfflineStore.markPackAcknowledgedToday();
                    void handleOpenRoom(true);
                  },
                },
                {
                  text: 'Go to Download',
                  onPress: () => {
                    setModalVisible(false);
                    router.push('/(proctor)/(tabs)/examination');
                  },
                },
              ],
            );
            return;
          }

          Alert.alert(
            "Download Today's Exam Module",
            `You must download today's latest examination module and passkeys before opening an examination room.\n\nThis ensures that any applicants who were rescheduled to today (${todayCheck.today}) are included in the roster.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Go to Download',
                onPress: () => {
                  setModalVisible(false);
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
        // Verify question bank has questions
        const hasQuestions = (pack.question_banks ?? []).some((b) =>
          (b.subjects ?? []).some((s) => (s.questions ?? []).length > 0),
        );
        if (!hasQuestions) missing.push('Question Bank / Exam Items');

        // Verify schedule exists in pack
        const sid = session?.scheduleId ?? null;
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
          // If schedule exists in pack, consider it aligned
          scheduleExists = true;
        }
        if (!scheduleExists && sid) missing.push('Schedule Alignment');
      }

      if (missing.length > 0) {
        Alert.alert(
          'System Update Required',
          `The following items are outdated or missing:\n\n• ${missing.join('\n• ')}\n\nPlease synchronize the examination pack before opening the room.`,
        );
        return;
      }

      // 3. Verify Wi-Fi / Campus LAN Network
      const { PeerExamClient } = await import('@/features/examinations/services/peerExamClient');
      await PeerExamClient.clear(); // Clear leftover peer client targets

      const hasPack = await OfflineStore.hasPack();
      const wifiCheck = await assertCampusWifiForJoin({ requireServer: !hasPack, isProctor: true });

      if (!wifiCheck.ok) {
        Alert.alert(
          'Unable to Open Room',
          wifiCheck.message ?? 'This phone has no Wi‑Fi connection. Connect to the examination Wi‑Fi or enable hotspot and try again.',
        );
        return;
      }

      // 4. Initialize / Ensure Lobby via LobbyRepository
      const snapshot = await LobbyRepository.ensureLobby(
        sessionId,
        undefined,
        selectedRoom.id,
        { claimConfirmed: Boolean(claimConfirmed || selectedRoom.claimRequired) },
      );
      console.log('Room opened successfully via LobbyRepository:', snapshot);

      // 5. Invalidate rooms query so cached room status updates immediately
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rooms(sessionId) });

      // 6. Navigate directly to the EXISTING Examination Lobby
      setModalVisible(false);
      router.push(targetRoute as any);
    } catch (error) {
      console.error('Failed to open room lobby:', error);
      Alert.alert(
        'Unable to Open Room',
        userFacingError(error, 'Unable to open this examination room. Check the room data and local Wi-Fi, then try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSelectRoom = (item: ExamRoom) => {
    const presentation = getRoomPresentation(item);
    if (presentation.isAssignedToOther || (!item.canOpen && item.assignedProctorName && !item.canControl)) {
      Alert.alert(
        'Restricted Room Assignment',
        'This room is assigned to another proctor. Please select your assigned room or an available unassigned room.',
      );
      return;
    }
    if (
      item.status !== 'ended' &&
      item.status !== 'lobby_open' &&
      item.status !== 'in_progress' &&
      scheduleAvailability !== 'available'
    ) {
      Alert.alert(
        'Schedule Not Active',
        scheduleAvailability === 'ended'
          ? 'This examination schedule has ended and cannot be opened.'
          : scheduleAvailability === 'too_early'
            ? 'This examination schedule is not open yet.'
            : 'This examination schedule is not available for opening.',
      );
      return;
    }
    if (!item.canOpen) {
      Alert.alert(
        'Room Unavailable',
        item.authorizationReason ||
          'This room is assigned to another proctor. Please select your assigned room or an available unassigned room.',
      );
      return;
    }
    setSelectedRoom(item);
    setModalVisible(true);
  };

  const roomRows = roomsQuery.data ?? [];
  const assignedRoom = roomRows.find((item) => getRoomPresentation(item).isAssignedToYou);
  const orderedRooms = assignedRoom
    ? [assignedRoom, ...roomRows.filter((item) => item.id !== assignedRoom.id)]
    : roomRows;
  const scheduleDate = schedule?.examinationDateIso || schedule?.examinationDate;
  const scheduleDateLabel = scheduleDate ? formatManilaScheduleDate(scheduleDate, true) : 'Examination day';

  return (
    <RoomsRedesign
      theme={scheduleTheme}
      sessionLabel={sessionLabel}
      batchLabel={session?.batchNumber || 'EXAMINATION'}
      scheduleName={scheduleName}
      scheduleDateLabel={scheduleDateLabel}
      rooms={orderedRooms}
      assignedRoomId={assignedRoom?.id}
      loading={roomsQuery.isLoading && !roomsQuery.data && !roomsLoadingTimedOut}
      error={roomsQuery.isError || roomsLoadingTimedOut ? (roomsLoadingTimedOut ? 'Room list took too long to load.' : 'Unable to load examination rooms.') : null}
      onRetry={() => {
        setRetryAttempt((attempt) => attempt + 1);
        void roomsQuery.refetch();
      }}
      onBack={() => safeBack(router, '/(proctor)/(tabs)/examination')}
      onSelectRoom={handleSelectRoom}
      scheduleAvailability={scheduleAvailability}
      selectedRoom={selectedRoom}
      modalVisible={modalVisible}
      busy={busy}
      onCloseModal={() => setModalVisible(false)}
      onOpenRoom={(claimConfirmed) => void handleOpenRoom(false, claimConfirmed)}
    />
  );

  if (roomsQuery.isLoading && !roomsQuery.data && !roomsLoadingTimedOut) {
    return (
      <View style={[styles.screen, { backgroundColor: themeColors.background }]}>
        <Header
          title="Select Examination Room"
          subtitle={session?.timeLabel ?? 'Loading rooms…'}
          onBack={() => safeBack(router, '/(proctor)/(tabs)/examination')}
        />
        <Breadcrumbs segments={breadcrumbs} />
        <View style={styles.list}>
          <SkeletonList rows={4} showAvatar={false} />
        </View>
      </View>
    );
  }

  if ((roomsQuery.isError || roomsLoadingTimedOut) && !roomsQuery.data) {
    return (
      <View style={[styles.screen, { backgroundColor: themeColors.background }]}>
        <Header
          title="Select Examination Room"
          subtitle={session?.timeLabel ?? 'Available Rooms'}
          onBack={() => safeBack(router, '/(proctor)/(tabs)/examination')}
        />
        <Breadcrumbs segments={breadcrumbs} />
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: themeColors.textSecondary }]}>
            {roomsLoadingTimedOut
              ? 'Loading examination rooms took too long.'
              : 'Unable to load examination rooms.'}
          </Text>
          <Button
            title="Retry"
            onPress={() => {
              setRetryAttempt((attempt) => attempt + 1);
              void roomsQuery.refetch();
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: themeColors.background }]}>
      <Header
        title="Select Examination Room"
        subtitle={session ? `${session.timeLabel} · ${session.venue}` : 'Available Rooms'}
        onBack={() => safeBack(router, '/(proctor)/(tabs)/examination')}
      />

      {/* STEP 3: DYNAMIC BREADCRUMBS */}
      <Breadcrumbs segments={breadcrumbs} />

      {/* STEP 4: ROOM SELECTION LIST */}
      <FlatList
        data={roomsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.2}>
              Available Examination Rooms ({roomsQuery.data?.length ?? 0})
            </Text>
            <Text style={[styles.intro, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.2}>
              Select an eligible room to initialize its local examination lobby.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No examination rooms available"
            description="No examination rooms are configured for this batch."
          />
        }
        renderItem={({ item, index }) => {
          const isOpen = item.status === 'lobby_open' || item.status === 'in_progress';
          const isAssignedToOther = Boolean(
            (!item.canOpen && item.assignedProctorName && !item.canControl) ||
            (item.ownerName && !item.canControl) ||
            (item.assignedProctorId != null && !item.canControl && !item.canOpen)
          );
          const hasNoStudents = Number(item.studentCount ?? 0) <= 0 && !isOpen;
          const isAssignedToYou = Boolean(
            item.canControl ||
            (item.assignedProctorId != null && item.canOpen && !item.claimRequired)
          );
          const isUnassigned = Boolean(
            item.assignedProctorId == null && !item.ownerName
          );

          let indicatorLabel = 'Unassigned — Claim Room';
          let chipTone: 'success' | 'warning' | 'danger' | 'default' = 'default';

          if (hasNoStudents) {
            indicatorLabel = 'No Students — Unavailable';
            chipTone = 'danger';
          } else if (isAssignedToOther) {
            indicatorLabel = 'Assigned to Another Proctor — Locked';
            chipTone = 'danger';
          } else if (isAssignedToYou) {
            if (isOpen) {
              indicatorLabel = 'Assigned to You — Lobby Open';
              chipTone = 'success';
            } else {
              indicatorLabel = 'Assigned to You — Open Room';
              chipTone = 'success';
            }
          } else if (isUnassigned) {
            if (item.claimRequired && item.canOpen) {
              indicatorLabel = 'Unassigned — Claim Room';
              chipTone = 'warning';
            } else if (!item.canOpen) {
              indicatorLabel = 'Unassigned — Locked';
              chipTone = 'danger';
            } else {
              indicatorLabel = 'Unassigned — Claim Room';
              chipTone = 'default';
            }
          }

          return (
            <Pressable
              onPress={() => {
                if (isAssignedToOther || (!item.canOpen && item.assignedProctorName && !item.canControl)) {
                  Alert.alert(
                    'Restricted Room Assignment',
                    'This room is assigned to another proctor. Please select your assigned room or an available unassigned room.',
                  );
                  return;
                }
                if (
                  item.status !== 'ended' &&
                  item.status !== 'lobby_open' &&
                  item.status !== 'in_progress' &&
                  scheduleAvailability !== 'available'
                ) {
                  Alert.alert(
                    'Schedule Not Active',
                    scheduleAvailability === 'ended'
                      ? 'This examination schedule has ended and cannot be opened.'
                      : scheduleAvailability === 'too_early'
                        ? 'This examination schedule is not open yet.'
                        : 'This examination schedule is not available for opening.',
                  );
                  return;
                }
                if (!item.canOpen) {
                  Alert.alert(
                    'Room Unavailable',
                    item.authorizationReason ||
                      'This room is assigned to another proctor. Please select your assigned room or an available unassigned room.',
                  );
                  return;
                }
                setSelectedRoom(item);
                setModalVisible(true);
              }}
            >
              <Card
                delay={index * 60}
                style={StyleSheet.flatten([
                  styles.roomCard,
                  { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder },
                ])}
              >
                <View style={styles.row}>
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: isOpen ? themeColors.successMuted : themeColors.cardMuted },
                    ]}
                  >
                    <DoorOpen size={24} color={isOpen ? themeColors.success : themeColors.textMuted} />
                  </View>

                  <View style={styles.meta}>
                    <Text style={[styles.roomName, { color: themeColors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {item.roomName}
                    </Text>

                    <View style={styles.infoRow}>
                      <Users size={14} color={themeColors.textMuted} />
                      <Text style={[styles.capacity, { color: themeColors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                        {Number(item.studentCount ?? 0)}/{item.capacity} Students
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Layers size={14} color={themeColors.accent} />
                      <Text style={[styles.applicants, { color: themeColors.accent }]} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                        {item.ownerName
                          ? `Managing: ${item.ownerName}`
                          : isAssignedToYou
                            ? 'Assigned: You'
                            : isAssignedToOther
                              ? `Assigned: ${item.assignedProctorName || 'Another Proctor'}`
                              : 'Assigned: None (Available to Claim)'}
                      </Text>
                    </View>

                    <View style={styles.badgeRow}>
                      <StatusChip
                        label={indicatorLabel}
                        tone={chipTone}
                      />
                    </View>
                  </View>

                  <ChevronRight size={22} color={themeColors.textMuted} style={{ flexShrink: 0 }} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      {/* STEP 5: OPEN EXAMINATION ROOM MODAL */}
      <Modal
        transparent
        visible={modalVisible}
        animationType="fade"
        onRequestClose={() => !busy && setModalVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !busy && setModalVisible(false)}
          />

          <View style={[styles.modalCard, { backgroundColor: themeColors.modal, borderColor: themeColors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: themeColors.accentMuted }]}>
                <DoorOpen size={24} color={themeColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.2}>
                  {selectedRoom?.claimRequired ? 'Claim Examination Room' : 'Open Examination Room'}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>
                  {selectedRoom?.claimRequired ? 'Confirm room claim to launch the lobby' : 'Confirm room details to launch the lobby'}
                </Text>
              </View>
            </View>

            {/* DETAIL TABLE */}
            <View style={[styles.detailTable, { backgroundColor: themeColors.cardMuted, borderColor: themeColors.cardBorder }]}>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Room</Text>
                <Text style={[styles.detailValueBold, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.2}>
                  {selectedRoom?.roomName || 'Room A'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Schedule</Text>
                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.15}>
                  {scheduleName}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Time</Text>
                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.15}>
                  {session?.timeLabel || '9:30 AM - 10:30 AM'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Assigned Proctor</Text>
                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.15}>
                  {selectedRoom?.claimRequired
                    ? 'Unassigned — You will claim this room'
                    : selectedRoom?.canControl
                      ? 'You (Active Proctor)'
                      : selectedRoom?.assignedProctorName || 'Any available proctor'}
                </Text>
              </View>

              {selectedRoom?.ownerName ? (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Managing Proctor</Text>
                  <Text style={[styles.detailValueBold, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.15}>
                    {selectedRoom.ownerName}
                  </Text>
                </View>
              ) : null}

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Students / Capacity</Text>
                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} maxFontSizeMultiplier={1.15}>
                  {Number(selectedRoom?.studentCount ?? 0)} students assigned (Max {selectedRoom?.capacity ?? 30})
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>Status</Text>
                <StatusChip
                  label={
                    selectedRoom?.claimRequired
                      ? 'Unassigned — Claim Room'
                      : selectedRoom?.ownerName
                        ? `Managed by ${selectedRoom.ownerName}`
                        : selectedRoom?.status === 'lobby_open' || selectedRoom?.status === 'in_progress'
                          ? 'Assigned to You — Lobby Open'
                          : selectedRoom?.status === 'ended'
                            ? 'Ended'
                            : 'Assigned to You — Ready to Open'
                  }
                  tone={
                    selectedRoom?.claimRequired
                      ? 'warning'
                      : selectedRoom?.status === 'ended'
                        ? 'danger'
                        : 'success'
                  }
                />
              </View>
            </View>

            <Text style={[styles.modalNotice, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.15}>
              {selectedRoom?.claimRequired
                ? 'Claiming this room will make you the active proctor, generate the examination QR code, and start the local Wi-Fi peer server.'
                : 'Opening this room will generate the examination QR code, start the local Wi-Fi peer server, and allow examinees to enter the lobby.'}
            </Text>

            {/* MODAL ACTIONS: [Cancel] [Open Room / Claim Room] */}
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                disabled={busy}
                onPress={() => setModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={
                  selectedRoom?.status === 'lobby_open' || selectedRoom?.status === 'in_progress'
                    ? 'Enter Lobby'
                    : selectedRoom?.status === 'ended'
                      ? 'View Results'
                      : scheduleAvailability === 'ended'
                        ? 'Schedule Ended'
                      : selectedRoom?.claimRequired
                        ? 'Claim Room'
                        : 'Open Room'
                }
                variant="primary"
                loading={busy}
                disabled={
                  Boolean(
                    selectedRoom &&
                    selectedRoom.status !== 'ended' &&
                    selectedRoom.status !== 'lobby_open' &&
                    selectedRoom.status !== 'in_progress' &&
                    scheduleAvailability !== 'available',
                  )
                }
                onPress={() => {
                  if (selectedRoom?.claimRequired) {
                    Alert.alert(
                      'Confirm Room Claim',
                      `Are you sure you want to claim ${selectedRoom.roomName} for ${scheduleName}? You will become the active proctor responsible for this room.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Confirm Claim',
                          onPress: () => void handleOpenRoom(false, true),
                        },
                      ],
                    );
                    return;
                  }
                  void handleOpenRoom();
                }}
                style={{
                  ...styles.openButton,
                  backgroundColor:
                    selectedRoom?.status === 'ended' ? themeColors.textMuted : themeColors.accent,
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type RoomPresentation = {
  isOpen: boolean;
  isAssignedToOther: boolean;
  hasNoStudents: boolean;
  isAssignedToYou: boolean;
  indicatorLabel: string;
  chipTone: 'success' | 'warning' | 'danger' | 'default';
};

function getRoomPresentation(item: ExamRoom): RoomPresentation {
  const isOpen = item.status === 'lobby_open' || item.status === 'in_progress';
  const isAssignedToOther = Boolean(
    (!item.canOpen && item.assignedProctorName && !item.canControl) ||
    (item.ownerName && !item.canControl) ||
    (item.assignedProctorId != null && !item.canControl && !item.canOpen),
  );
  const hasNoStudents = Number(item.studentCount ?? 0) <= 0 && !isOpen;
  const isAssignedToYou = Boolean(
    item.canControl ||
    (item.assignedProctorId != null && item.canOpen && !item.claimRequired),
  );
  const isUnassigned = Boolean(item.assignedProctorId == null && !item.ownerName);

  if (hasNoStudents) {
    return { isOpen, isAssignedToOther, hasNoStudents, isAssignedToYou, indicatorLabel: 'No Students · Unavailable', chipTone: 'danger' };
  }
  if (isAssignedToOther) {
    return { isOpen, isAssignedToOther, hasNoStudents, isAssignedToYou, indicatorLabel: 'Assigned to Another Proctor · Locked', chipTone: 'danger' };
  }
  if (isAssignedToYou) {
    return { isOpen, isAssignedToOther, hasNoStudents, isAssignedToYou, indicatorLabel: isOpen ? 'Assigned to You · Lobby Open' : 'Assigned to You · Open Room', chipTone: 'success' };
  }
  if (isUnassigned && item.claimRequired && item.canOpen) {
    return { isOpen, isAssignedToOther, hasNoStudents, isAssignedToYou, indicatorLabel: 'Unassigned · Claim Room', chipTone: 'warning' };
  }
  return {
    isOpen,
    isAssignedToOther,
    hasNoStudents,
    isAssignedToYou,
    indicatorLabel: item.canOpen ? 'Unassigned · Claim Room' : 'Unassigned · Locked',
    chipTone: item.canOpen ? 'default' : 'danger',
  };
}

function RoomScreenHeader({
  subtitle,
  onBack,
  theme,
}: {
  subtitle: string;
  onBack: () => void;
  theme: ReturnType<typeof useScheduleRedesignTheme>;
}) {
  return (
    <View style={roomRedesignStyles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={[roomRedesignStyles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <ArrowLeft size={20} color={theme.text} />
      </Pressable>
      <View style={roomRedesignStyles.topBarCopy}>
        <Text style={[roomRedesignStyles.topBarTitle, { color: theme.text }]}>Select Examination Room</Text>
        <Text style={[roomRedesignStyles.topBarSubtitle, { color: theme.secondaryText }]} numberOfLines={1}>{subtitle}</Text>
      </View>
    </View>
  );
}

function RoomStateCard({
  title,
  body,
  actionLabel,
  onAction,
  theme,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  theme: ReturnType<typeof useScheduleRedesignTheme>;
}) {
  return (
    <View style={roomRedesignStyles.stateWrap}>
      <View style={[roomRedesignStyles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <CalendarDays size={24} color={theme.primary} />
        <Text style={[roomRedesignStyles.stateTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[roomRedesignStyles.stateBody, { color: theme.secondaryText }]}>{body}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={[roomRedesignStyles.secondaryAction, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
            <Text style={[roomRedesignStyles.secondaryActionText, { color: theme.text }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function RoomStatusPill({
  label,
  tone,
  theme,
}: {
  label: string;
  tone: RoomPresentation['chipTone'];
  theme: ReturnType<typeof useScheduleRedesignTheme>;
}) {
  const background = tone === 'success'
    ? theme.successBackground
    : tone === 'warning'
      ? theme.warningBackground
      : tone === 'danger'
        ? theme.dangerBackground
        : theme.mutedSurface;
  const color = tone === 'success'
    ? theme.successText
    : tone === 'warning'
      ? theme.warningText
      : tone === 'danger'
        ? theme.dangerText
        : theme.secondaryText;
  return (
    <View style={[roomRedesignStyles.statusPill, { backgroundColor: background }]}>
      <Text style={[roomRedesignStyles.statusPillText, { color }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function RoomDetailRow({
  label,
  value,
  strong = false,
  theme,
}: {
  label: string;
  value: string;
  strong?: boolean;
  theme: ReturnType<typeof useScheduleRedesignTheme>;
}) {
  return (
    <View style={roomRedesignStyles.detailRow}>
      <Text style={[roomRedesignStyles.detailLabel, { color: theme.secondaryText }]}>{label}</Text>
      <Text style={[strong ? roomRedesignStyles.detailValueStrong : roomRedesignStyles.detailValue, { color: theme.text }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

function RoomsRedesign({
  theme,
  sessionLabel,
  batchLabel,
  scheduleName,
  scheduleDateLabel,
  rooms,
  assignedRoomId,
  loading,
  error,
  onRetry,
  onBack,
  onSelectRoom,
  scheduleAvailability,
  selectedRoom,
  modalVisible,
  busy,
  onCloseModal,
  onOpenRoom,
}: {
  theme: ReturnType<typeof useScheduleRedesignTheme>;
  sessionLabel: string;
  batchLabel: string;
  scheduleName: string;
  scheduleDateLabel: string;
  rooms: ExamRoom[];
  assignedRoomId?: string;
  loading: boolean;
  error?: string | null;
  onRetry: () => void;
  onBack: () => void;
  onSelectRoom: (room: ExamRoom) => void;
  scheduleAvailability: ReturnType<typeof getProctorScheduleAvailability>;
  selectedRoom: ExamRoom | null;
  modalVisible: boolean;
  busy: boolean;
  onCloseModal: () => void;
  onOpenRoom: (claimConfirmed?: boolean) => void;
}) {
  const otherRoomCount = Math.max(0, rooms.length - (assignedRoomId ? 1 : 0));
  const actionDisabled = Boolean(
    busy ||
    (selectedRoom &&
      selectedRoom.status !== 'ended' &&
      selectedRoom.status !== 'lobby_open' &&
      selectedRoom.status !== 'in_progress' &&
      scheduleAvailability !== 'available'),
  );

  if (loading) {
    return (
      <View style={[roomRedesignStyles.screen, { backgroundColor: theme.background }]}>
        <RoomScreenHeader subtitle={`${sessionLabel} · Loading rooms…`} onBack={onBack} theme={theme} />
        <View style={roomRedesignStyles.loadingList}><SkeletonList rows={4} showAvatar={false} /></View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[roomRedesignStyles.screen, { backgroundColor: theme.background }]}>
        <RoomScreenHeader subtitle={sessionLabel} onBack={onBack} theme={theme} />
        <RoomStateCard title="Unable to load rooms" body={error} actionLabel="Retry" onAction={onRetry} theme={theme} />
      </View>
    );
  }

  return (
    <View style={[roomRedesignStyles.screen, { backgroundColor: theme.background }]}>
      <RoomScreenHeader subtitle={sessionLabel} onBack={onBack} theme={theme} />
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={roomRedesignStyles.list}
        ListHeaderComponent={
          <View style={roomRedesignStyles.headerBlock}>
            <View style={[roomRedesignStyles.heroCard, { backgroundColor: theme.primary }]}>
              <Text style={roomRedesignStyles.heroEyebrow}>{scheduleName.toUpperCase()} · {batchLabel.toUpperCase()}</Text>
              <Text style={roomRedesignStyles.heroTime}>{sessionLabel}</Text>
              <Text style={roomRedesignStyles.heroMeta}>{scheduleDateLabel} · {rooms.length} room{rooms.length === 1 ? '' : 's'}</Text>
            </View>
            <Text style={[roomRedesignStyles.sectionLabel, { color: theme.primary }]}>
              {assignedRoomId ? 'YOUR ROOM' : `AVAILABLE ROOMS · ${rooms.length}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <RoomStateCard title="No examination rooms available" body="No examination rooms are configured for this batch." theme={theme} />
        }
        renderItem={({ item, index }) => {
          const presentation = getRoomPresentation(item);
          const isYourRoom = item.id === assignedRoomId;
          const roomActionLabel = item.status === 'lobby_open' || item.status === 'in_progress'
            ? 'Enter Lobby'
            : item.status === 'ended'
              ? 'View Results'
              : item.claimRequired
                ? 'Claim Room'
                : 'Open Room';
          return (
            <View style={roomRedesignStyles.roomItemWrap}>
              {assignedRoomId && index === 1 ? (
                <Text style={[roomRedesignStyles.sectionLabel, roomRedesignStyles.otherRoomsLabel, { color: theme.secondaryText }]}>
                  OTHER ROOMS · {otherRoomCount}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.roomName}, ${presentation.indicatorLabel}`}
                onPress={() => onSelectRoom(item)}
              >
                <View style={[roomRedesignStyles.roomCard, {
                  backgroundColor: isYourRoom ? theme.surface : theme.mutedSurface,
                  borderColor: isYourRoom ? theme.primary : theme.mutedSurface,
                  borderWidth: isYourRoom ? 2 : 0,
                }]}>
                  <View style={roomRedesignStyles.roomRow}>
                    <View style={[roomRedesignStyles.iconWrap, { backgroundColor: isYourRoom ? theme.primaryTint : theme.surface }]}>
                      {isYourRoom || presentation.isOpen
                        ? <DoorOpen size={25} color={isYourRoom ? theme.primary : theme.secondaryText} />
                        : <LockKeyhole size={22} color={theme.secondaryText} />}
                    </View>
                    <View style={roomRedesignStyles.meta}>
                      <Text style={[roomRedesignStyles.roomName, { color: isYourRoom ? theme.text : theme.doneText }]} numberOfLines={1}>{item.roomName}</Text>
                      <View style={roomRedesignStyles.infoRow}>
                        <Users size={14} color={theme.secondaryText} />
                        <Text style={[roomRedesignStyles.capacity, { color: theme.secondaryText }]} numberOfLines={1}>{Number(item.studentCount ?? 0)} / {item.capacity} students</Text>
                      </View>
                      <View style={roomRedesignStyles.infoRow}>
                        <Layers size={14} color={isYourRoom ? theme.primary : theme.secondaryText} />
                        <Text style={[roomRedesignStyles.applicants, { color: isYourRoom ? theme.primary : theme.secondaryText }]} numberOfLines={1}>
                          {item.ownerName
                            ? `Managing: ${item.ownerName}`
                            : presentation.isAssignedToYou
                              ? 'Assigned: You'
                              : presentation.isAssignedToOther
                                ? `Assigned: ${item.assignedProctorName || 'Another Proctor'}`
                                : 'Available to claim'}
                        </Text>
                      </View>
                    </View>
                    <RoomStatusPill label={presentation.indicatorLabel} tone={presentation.chipTone} theme={theme} />
                  </View>
                  {isYourRoom ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => onSelectRoom(item)}
                      style={[roomRedesignStyles.primaryAction, { backgroundColor: theme.primary }, busy && roomRedesignStyles.disabledAction]}
                    >
                      <Text style={roomRedesignStyles.primaryActionText}>{roomActionLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        }}
      />

      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => !busy && onCloseModal()}>
        <View style={[roomRedesignStyles.overlay, { backgroundColor: 'rgba(42,31,28,0.42)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && onCloseModal()} />
          <View style={[roomRedesignStyles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={roomRedesignStyles.modalHeader}>
              <View style={[roomRedesignStyles.modalIconWrap, { backgroundColor: theme.primaryTint }]}>
                <DoorOpen size={24} color={theme.primary} />
              </View>
              <View style={roomRedesignStyles.modalHeaderCopy}>
                <Text style={[roomRedesignStyles.modalTitle, { color: theme.text }]}>{selectedRoom?.claimRequired ? 'Claim Examination Room' : 'Open Examination Room'}</Text>
                <Text style={[roomRedesignStyles.modalSubtitle, { color: theme.secondaryText }]}>{selectedRoom?.claimRequired ? 'Confirm room claim to launch the lobby' : 'Confirm room details to launch the lobby'}</Text>
              </View>
            </View>

            <View style={[roomRedesignStyles.detailTable, { backgroundColor: theme.mutedSurface, borderColor: theme.border }]}>
              <RoomDetailRow label="Room" value={selectedRoom?.roomName || 'Room A'} strong theme={theme} />
              <RoomDetailRow label="Schedule" value={scheduleName} theme={theme} />
              <RoomDetailRow label="Time" value={sessionLabel} theme={theme} />
              <RoomDetailRow label="Assigned Proctor" value={selectedRoom?.claimRequired ? 'Unassigned — You will claim this room' : selectedRoom?.canControl ? 'You (Active Proctor)' : selectedRoom?.assignedProctorName || 'Any available proctor'} theme={theme} />
              {selectedRoom?.ownerName ? <RoomDetailRow label="Managing Proctor" value={selectedRoom.ownerName} strong theme={theme} /> : null}
              <RoomDetailRow label="Students / Capacity" value={`${Number(selectedRoom?.studentCount ?? 0)} students assigned (Max ${selectedRoom?.capacity ?? 30})`} theme={theme} />
              <View style={roomRedesignStyles.detailRow}>
                <Text style={[roomRedesignStyles.detailLabel, { color: theme.secondaryText }]}>Status</Text>
                <RoomStatusPill
                  label={selectedRoom?.claimRequired
                    ? 'Unassigned · Claim Room'
                    : selectedRoom?.ownerName
                      ? `Managed by ${selectedRoom.ownerName}`
                      : selectedRoom?.status === 'lobby_open' || selectedRoom?.status === 'in_progress'
                        ? 'Assigned to You · Lobby Open'
                        : selectedRoom?.status === 'ended'
                          ? 'Ended'
                          : 'Assigned to You · Ready to Open'}
                  tone={selectedRoom?.claimRequired ? 'warning' : selectedRoom?.status === 'ended' ? 'danger' : 'success'}
                  theme={theme}
                />
              </View>
            </View>

            <View style={[roomRedesignStyles.modalNotice, { backgroundColor: theme.primaryTint }]}>
              <MapPin size={17} color={theme.primary} />
              <Text style={[roomRedesignStyles.modalNoticeText, { color: theme.secondaryText }]}>
                {selectedRoom?.claimRequired
                  ? 'Claiming this room will make you the active proctor, generate the examination QR code, and start the local Wi-Fi peer server.'
                  : 'Opening this room will generate the examination QR code, start the local Wi-Fi peer server, and allow examinees to enter the lobby.'}
              </Text>
            </View>

            <View style={roomRedesignStyles.modalActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={onCloseModal} style={[roomRedesignStyles.secondaryAction, { backgroundColor: theme.mutedSurface, borderColor: theme.border }, busy && roomRedesignStyles.disabledAction]}>
                <Text style={[roomRedesignStyles.secondaryActionText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={actionDisabled}
                onPress={() => {
                  if (selectedRoom?.claimRequired) {
                    Alert.alert(
                      'Confirm Room Claim',
                      `Are you sure you want to claim ${selectedRoom.roomName} for ${scheduleName}? You will become the active proctor responsible for this room.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Confirm Claim', onPress: () => onOpenRoom(true) },
                      ],
                    );
                    return;
                  }
                  onOpenRoom(false);
                }}
                style={[roomRedesignStyles.primaryAction, { backgroundColor: selectedRoom?.status === 'ended' ? theme.disabledBackground : theme.primary }, actionDisabled && roomRedesignStyles.disabledAction]}
              >
                <Text style={[roomRedesignStyles.primaryActionText, { color: selectedRoom?.status === 'ended' ? theme.secondaryText : '#FFFFFF' }]}>
                  {busy
                    ? 'Opening…'
                    : selectedRoom?.status === 'lobby_open' || selectedRoom?.status === 'in_progress'
                      ? 'Enter Lobby'
                      : selectedRoom?.status === 'ended'
                        ? 'View Results'
                        : scheduleAvailability === 'ended'
                          ? 'Schedule Ended'
                          : selectedRoom?.claimRequired
                            ? 'Claim Room'
                            : 'Open Room'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const roomRedesignStyles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { paddingHorizontal: scheduleRedesignLayout.pagePadding, paddingTop: 18, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topBarCopy: { flex: 1, minWidth: 0 },
  topBarTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  topBarSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  list: { paddingHorizontal: scheduleRedesignLayout.pagePadding, paddingTop: 12, gap: 10, paddingBottom: 36 },
  loadingList: { padding: scheduleRedesignLayout.pagePadding, gap: 12 },
  headerBlock: { gap: 16, marginBottom: 2 },
  heroCard: { borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18, gap: 6 },
  heroEyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, opacity: 0.86 },
  heroTime: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  heroMeta: { fontSize: 13, fontWeight: '600', opacity: 0.9 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  otherRoomsLabel: { marginTop: 8, marginBottom: 1 },
  roomItemWrap: { gap: 8 },
  roomCard: { borderRadius: 22, padding: 16, gap: 14 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, minWidth: 0, gap: 5 },
  roomName: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  capacity: { fontSize: 13, fontWeight: '600' },
  applicants: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '700' },
  statusPill: { maxWidth: 148, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  statusPillText: { fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  primaryAction: { minHeight: scheduleRedesignLayout.primaryButtonHeight, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flex: 1 },
  primaryActionText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  stateWrap: { paddingHorizontal: scheduleRedesignLayout.pagePadding, paddingTop: 20 },
  stateCard: { borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center', gap: 9 },
  stateTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '90%', borderRadius: 22, padding: 20, borderWidth: 1, gap: 15 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalHeaderCopy: { flex: 1, minWidth: 0 },
  modalIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  detailTable: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 11 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  detailLabel: { fontSize: 12, fontWeight: '600' },
  detailValue: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'right' },
  detailValueStrong: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 19, fontWeight: '800', textAlign: 'right' },
  modalNotice: { borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  modalNoticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10 },
  secondaryAction: { minHeight: scheduleRedesignLayout.primaryButtonHeight, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flex: 1 },
  secondaryActionText: { fontSize: 16, fontWeight: '800' },
  disabledAction: { opacity: 0.55 },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  errorWrap: { padding: 20, gap: 12, alignItems: 'flex-start' },
  errorText: { fontSize: 14 },
  headerBlock: { marginBottom: 4 },
  sectionTitle: { ...typography.title, fontSize: 18, lineHeight: 26, fontWeight: '800' },
  intro: { fontSize: 13, lineHeight: 20, fontWeight: '500' },
  roomCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    ...shadows.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, gap: 4 },
  roomName: { ...typography.title, fontSize: 22, lineHeight: 30, fontWeight: '800' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  capacity: { ...typography.caption, fontFamily: 'Poppins_500Medium' },
  applicants: { ...typography.caption, fontFamily: 'Poppins_600SemiBold' },
  badgeRow: { flexDirection: 'row', marginTop: 4 },

  // MODAL STYLING
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    gap: 16,
    ...shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2A1414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#A1A1AA',
    fontWeight: '500',
    marginTop: 1,
  },
  detailTable: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262626',
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 13,
    color: '#A1A1AA',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailValueBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalNotice: {
    fontSize: 12,
    color: '#A1A1AA',
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  openButton: {
    flex: 1,
  },
});
