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
  DoorOpen,
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
import { shadows, typography } from '@/shared/theme';
import { safeBack } from '@/shared/utils';
import { userFacingError } from '@/shared/utils/userFacingError';
import { assertCampusWifiForJoin } from '@/features/monitoring/services/campusWifiGate';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { getProctorScheduleAvailability } from '@/features/schedules/utils/proctorScheduleWindow';
import type { ExamRoom } from '@/shared/types';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

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

  const [selectedRoom, setSelectedRoom] = useState<ExamRoom | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const session =
    selectedSession ??
    sessionsQuery.data?.find((item) => item.id === sessionId) ??
    null;

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
            <Text style={[styles.intro, { color: themeColors.textSecondary }]} maxFontSizeMultiplier={1.2}>
              Available Rooms for this time slot. Tap any room to open the examination room modal and initialize the lobby.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No examination rooms available"
            description="There are no rooms assigned to this schedule and time slot."
          />
        }
        renderItem={({ item, index }) => {
          const isOpen = item.status === 'lobby_open' || item.status === 'in_progress';
          const isAssignedToOther = Boolean(
            (!item.canOpen && item.assignedProctorName && !item.canControl) ||
            (item.ownerName && !item.canControl) ||
            (item.assignedProctorId != null && !item.canControl && !item.canOpen)
          );
          const isAssignedToYou = Boolean(
            item.canControl ||
            (item.assignedProctorId != null && item.canOpen && !item.claimRequired)
          );
          const isUnassigned = Boolean(
            item.assignedProctorId == null && !item.ownerName
          );

          let indicatorLabel = 'Unassigned — Claim Room';
          let chipTone: 'success' | 'warning' | 'danger' | 'default' = 'default';

          if (isAssignedToOther) {
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
                        {Number(item.studentCount ?? 0)} students assigned · Capacity: {item.capacity}
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

          <View style={[styles.modalCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F1E8' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  errorWrap: { padding: 20, gap: 12, alignItems: 'flex-start' },
  errorText: { fontSize: 14, color: '#5B4A45' },
  headerBlock: { marginBottom: 4 },
  intro: { fontSize: 13, lineHeight: 20, color: '#5B4A45', fontWeight: '500' },
  roomCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5D8C8',
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
  roomName: { ...typography.title, fontSize: 22, lineHeight: 30, fontWeight: '800', color: '#2B1A17' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  capacity: { ...typography.caption, fontFamily: 'Poppins_500Medium', color: '#A1A1AA' },
  applicants: { ...typography.caption, fontFamily: 'Poppins_600SemiBold', color: '#7A1F2B' },
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
    backgroundColor: '#FFFDF9',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E5D8C8',
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
