import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Text,
  View,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  DoorOpen,
  Users,
  ChevronRight,
  Layers,
} from 'lucide-react-native';
import { Header, Card, Button, EmptyState, StatusChip, Breadcrumbs } from '@/components/ui';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useRooms, useSchedules, useSessions } from '@/hooks/useRepositories';
import { LobbyRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useProctorStore } from '@/stores';
import { colors, shadows } from '@/theme';
import { safeBack } from '@/utils';
import { assertCampusWifiForJoin } from '@/services/campusWifiGate';
import type { ExamRoom } from '@/types';

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

  // STEP 3: Dynamic route-aware breadcrumbs: Examination > Morning Schedule > 9:30 AM - 10:30 AM
  const breadcrumbs = [
    {
      label: 'Examination',
      onPress: () => router.replace('/(proctor)/examination' as any),
    },
    {
      label: scheduleName,
      onPress: () => router.replace('/(proctor)/examination' as any),
    },
    {
      label: sessionLabel,
    },
  ];

  // HIERARCHICAL NAVIGATION: Android hardware back button returns to Examination tab
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      safeBack(router, '/(proctor)/examination' as any);
      return true;
    });
    return () => sub.remove();
  }, [router]);

  /**
   * STEP 6 & 7: Comprehensive Validation and Direct Navigation to Existing Lobby
   */
  const handleOpenRoom = async () => {
    if (!selectedRoom || !sessionId) {
      Alert.alert('Unable to Open Room', 'Missing room or session identification.');
      return;
    }

    const isEnded = selectedRoom.status === 'ended';
    const isOpen = selectedRoom.status === 'lobby_open' || selectedRoom.status === 'in_progress';

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
      const { OfflineStore } = await import('@/services/offlineStore');
      const todayCheck = await OfflineStore.isPackDownloadedToday();
      if (!todayCheck.downloadedToday) {
        Alert.alert(
          "Download Today's Exam Module",
          `You must download today's latest examination module and passkeys before opening an examination room.\n\nThis ensures that any applicants who were rescheduled to today (${todayCheck.today}) are included in the roster.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Download',
              onPress: () => {
                setModalVisible(false);
                router.push('/(proctor)/examination' as any);
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
      const { PeerExamClient } = await import('@/services/peerExamClient');
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
      const snapshot = await LobbyRepository.ensureLobby(sessionId, undefined, selectedRoom.id);
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
        error instanceof Error ? error.message : 'Please check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (roomsQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <Header
          title="Select Examination Room"
          subtitle={session?.timeLabel ?? 'Loading rooms…'}
          onBack={() => safeBack(router, '/(proctor)/examination' as any)}
        />
        <Breadcrumbs segments={breadcrumbs} />
        <View style={styles.list}>
          <SkeletonList rows={4} showAvatar={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Select Examination Room"
        subtitle={session ? `${session.timeLabel} · ${session.venue}` : 'Available Rooms'}
        onBack={() => safeBack(router, '/(proctor)/examination' as any)}
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
            <Text style={styles.intro} maxFontSizeMultiplier={1.2}>
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
          return (
            <Pressable
              onPress={() => {
                setSelectedRoom(item);
                setModalVisible(true);
              }}
            >
              <Card delay={index * 60} style={styles.roomCard}>
                <View style={styles.row}>
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: isOpen ? '#E6F4EA' : '#F1F5F9' },
                    ]}
                  >
                    <DoorOpen size={24} color={isOpen ? '#28A745' : '#64748B'} />
                  </View>

                  <View style={styles.meta}>
                    <Text style={styles.roomName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {item.roomName}
                    </Text>

                    <View style={styles.infoRow}>
                      <Users size={14} color="#64748B" />
                      <Text style={styles.capacity} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                        Capacity: {item.capacity} Applicants
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Layers size={14} color="#0055A4" />
                      <Text style={styles.applicants} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                        Current Applicants: {item.connectedCount ?? 0}
                      </Text>
                    </View>

                    <View style={styles.badgeRow}>
                      <StatusChip
                        label={roomStatusLabel(item.status)}
                        tone={roomTone(item.status)}
                      />
                    </View>
                  </View>

                  <ChevronRight size={22} color={colors.inkMuted} style={{ flexShrink: 0 }} />
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

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <DoorOpen size={24} color="#003366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} maxFontSizeMultiplier={1.2}>
                  Open Examination Room
                </Text>
                <Text style={styles.modalSubtitle} maxFontSizeMultiplier={1.15}>
                  Confirm room details to launch the lobby
                </Text>
              </View>
            </View>

            {/* DETAIL TABLE */}
            <View style={styles.detailTable}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Room</Text>
                <Text style={styles.detailValueBold} maxFontSizeMultiplier={1.2}>
                  {selectedRoom?.roomName || 'Room A'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Schedule</Text>
                <Text style={styles.detailValue} maxFontSizeMultiplier={1.15}>
                  {scheduleName}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Time</Text>
                <Text style={styles.detailValue} maxFontSizeMultiplier={1.15}>
                  {session?.timeLabel || '9:30 AM - 10:30 AM'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Capacity</Text>
                <Text style={styles.detailValue} maxFontSizeMultiplier={1.15}>
                  {selectedRoom?.capacity ?? 60} Applicants
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Status</Text>
                <StatusChip
                  label={roomStatusLabel(selectedRoom?.status || 'idle')}
                  tone={roomTone(selectedRoom?.status || 'idle')}
                />
              </View>
            </View>

            <Text style={styles.modalNotice} maxFontSizeMultiplier={1.15}>
              Opening this room will generate the examination QR code, start the local Wi-Fi peer server, and allow examinees to enter the lobby.
            </Text>

            {/* MODAL ACTIONS: [Cancel] [Open Room] */}
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
                      : 'Open Room'
                }
                variant="primary"
                loading={busy}
                onPress={handleOpenRoom}
                style={{
                  ...styles.openButton,
                  backgroundColor:
                    selectedRoom?.status === 'ended' ? '#003366' : '#28A745',
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
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  headerBlock: { marginBottom: 4 },
  intro: { fontSize: 13, lineHeight: 20, color: '#64748B', fontWeight: '500' },
  roomCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  roomName: { fontSize: 17, fontWeight: '800', color: '#003366' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  capacity: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  applicants: { fontSize: 13, fontWeight: '700', color: '#0055A4' },
  badgeRow: { flexDirection: 'row', marginTop: 4 },

  // MODAL STYLING
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    backgroundColor: '#EBF3FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#003366',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  detailTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  detailValueBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#003366',
  },
  modalNotice: {
    fontSize: 12,
    color: '#64748B',
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
