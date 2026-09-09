import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  Text,
  View,
  StyleSheet,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  BackHandler,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  DownloadCloud,
  AlertTriangle,
  CheckCircle2,
  DoorOpen,
  Clock,
  Calendar,
  LogOut,
} from 'lucide-react-native';
import { Header, Card, Button, EmptyState, Breadcrumbs, StatusChip } from '@/components/ui';
import { ScheduleCard } from '@/features/proctor/ScheduleCard';
import { useSchedules } from '@/hooks/useRepositories';
import { AuthRepository, LobbyRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useProctorStore } from '@/stores';
import { ensureExamPackCached } from '@/services/ensureExamPack';
import { OfflineStore } from '@/services/offlineStore';
import { assertCampusWifiForJoin } from '@/services/campusWifiGate';
import { shadows } from '@/theme';
import type { ExamSchedule, ExamSession } from '@/types';
import { confirmProctorLogout } from '@/utils/confirmProctorLogout';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PackSummary = Awaited<ReturnType<typeof OfflineStore.getPackSummary>>;

type SelectedSlotDetails = {
  schedule: ExamSchedule;
  session: ExamSession;
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

  const refreshPackData = useCallback(async () => {
    const [summary, today, rooms] = await Promise.all([
      OfflineStore.getPackSummary(),
      OfflineStore.isPackDownloadedToday(),
      OfflineStore.getOpenedRooms(),
    ]);
    setPack(summary);
    setTodayStatus(today);
    setOpenedRooms(rooms);
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

  // HIERARCHICAL NAVIGATION: Back button and hardware back press return to Dashboard
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openModalVisible) {
        setOpenModalVisible(false);
        return true;
      }
      router.navigate('/(proctor)/dashboard' as any);
      return true;
    });
    return () => sub.remove();
  }, [openModalVisible, router]);

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
          ? `${summary.students} student(s) and ${summary.questions} questionnaire items cached successfully for today.`
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
    const cleanSess = String(session.id).replace(/^offline-/, '');
    const sidNum =
      parseInt(cleanSess.split('-')[0] || '', 10) ||
      Number(String(schedule.id).replace(/^date-/, '').replace(/^offline-/, '').split('-')[0]) ||
      Number(String(session.id).replace(/^offline-/, '').split('-')[0]) ||
      1;

    const schedMatch = (offlinePack?.schedules ?? []).find(
      (s) => s.id === sidNum || String(s.id) === String(schedule.id),
      (s) => s.id === sidNum || String(s.id) === String(session.id) || String(s.id) === cleanSess,
      (s: any) =>
        s.id === sidNum ||
        String(s.id) === String(schedule.id) ||
        String(s.id) === String(session.id) ||
        String(s.id) === cleanSess,
    );
    const roomObj = schedMatch?.rooms?.[0];
    const roomId = roomObj?.id ?? 1;
    const roomName = roomObj?.room_name ?? session.venue ?? 'Room 101';
    const capacity = roomObj?.capacity ?? 60;

    // Check if this room/schedule is already opened
    const currentOpened = await OfflineStore.getOpenedRooms();
    setOpenedRooms(currentOpened);

    const exactKey = `${sidNum}:${roomId}`;
    const matchingEntry =
      currentOpened[exactKey] ||
      Object.entries(currentOpened).find(([k]) => {
        const [s] = k.split(':').map(Number);
        return s === sidNum || String(k).startsWith(`${sidNum}:`);
      })?.[1];

    const isOpened = Boolean(
      matchingEntry && (matchingEntry.status === 'lobby_open' || matchingEntry.status === 'in_progress'),
    );
    const isEnded = Boolean(matchingEntry && matchingEntry.status === 'ended');

    setSelectedSlot({
      schedule,
      session,
      sidNum,
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
      router.push('/(proctor)/results' as any);
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
      const { PeerExamClient } = await import('@/services/peerExamClient');
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

  const scheduleName = selectedSlot
    ? selectedSlot.schedule.name.replace(/Entrance\s+Examination/gi, '').trim() ||
      selectedSlot.schedule.name
    : 'Examination Schedule';

  return (
    <View style={styles.screen}>
      <Header
        title="Examination Schedules"
        subtitle={
          todayStatus.downloadedToday
            ? 'Offline Pack Ready · Updated Today'
            : pack?.ready
              ? "Update Required for Today's Exam"
              : 'Download Pack Required'
        }
        onBack={() => router.navigate('/(proctor)/dashboard' as any)}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Logout"
            onPress={() => confirmProctorLogout(router)}
            hitSlop={8}
          >
            <LogOut size={18} color="#B42318" />
          </Pressable>
        }
      />

      <Breadcrumbs segments={[{ label: 'Entrance Examination' }]} />

      <FlatList
        data={schedulesQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* COMPACT OFFLINE EXAM PACK CARD */}
            <Card
              style={{
                ...styles.packCard,
                ...(!todayStatus.downloadedToday
                  ? { borderColor: '#F59E0B', borderWidth: 1.5, backgroundColor: '#FFFBEB' }
                  : {}),
              }}
            >
              <View style={styles.packRow}>
                <View
                  style={[
                    styles.packIconWrap,
                    { backgroundColor: todayStatus.downloadedToday ? '#E6F4EA' : '#FEF3C7' },
                  ]}
                >
                  {todayStatus.downloadedToday ? (
                    <CheckCircle2 size={20} color="#28A745" />
                  ) : (
                    <AlertTriangle size={20} color="#D97706" />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.packTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {todayStatus.downloadedToday
                      ? "Today's Exam Pack Ready"
                      : "Daily Exam Module Required"}
                  </Text>
                  <Text style={styles.packSub} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                    {todayStatus.downloadedToday
                      ? `Updated Today (${todayStatus.today}) · ${pack?.students ?? 0} students · ${pack?.questions ?? 0} questions`
                      : "Download today's passkeys and latest module to include rescheduled applicants."}
                  </Text>
                </View>
                <View style={{ flexShrink: 0 }}>
                  <Button
                    title={todayStatus.downloadedToday ? 'Update' : "Download Pack"}
                    variant={todayStatus.downloadedToday ? 'outline' : 'primary'}
                    size="sm"
                    loading={refreshing}
                    onPress={() => void downloadPack()}
                  />
                </View>
              </View>
            </Card>

            <Text style={styles.intro} maxFontSizeMultiplier={1.2}>
              Tap any schedule below to expand available time slots. Tap a time slot to directly open the examination room and manage examinees.
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No examination schedules available" />}
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

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconWrap,
                  selectedSlot?.isOpened && { backgroundColor: '#E6F4EA' },
                  selectedSlot?.isEnded && { backgroundColor: '#F1F5F9' },
                ]}
              >
                <DoorOpen
                  size={24}
                  color={
                    selectedSlot?.isOpened
                      ? '#28A745'
                      : selectedSlot?.isEnded
                        ? '#64748B'
                        : '#003366'
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} maxFontSizeMultiplier={1.2}>
                  {selectedSlot?.isOpened
                    ? 'Enter Examination Lobby'
                    : selectedSlot?.isEnded
                      ? 'Examination Completed'
                      : 'Open Examination Room'}
                </Text>
                <Text style={styles.modalSubtitle} maxFontSizeMultiplier={1.15}>
                  {selectedSlot?.isOpened
                    ? 'Room is currently active and broadcasting'
                    : selectedSlot?.isEnded
                      ? 'This session has ended and is closed'
                      : 'Confirm details to launch the lobby'}
                </Text>
              </View>
            </View>

            {/* DETAIL TABLE */}
            <View style={styles.detailTable}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Room</Text>
                <Text style={styles.detailValueBold} maxFontSizeMultiplier={1.2}>
                  {selectedSlot?.roomName || 'Room 101'}
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
                  {selectedSlot?.session.timeLabel || '9:30 AM - 10:30 AM'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Capacity</Text>
                <Text style={styles.detailValue} maxFontSizeMultiplier={1.15}>
                  {selectedSlot?.capacity ?? 60} Applicants
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel} maxFontSizeMultiplier={1.15}>Status</Text>
                <StatusChip
                  label={
                    selectedSlot?.isOpened
                      ? selectedSlot?.openedStatus === 'in_progress'
                        ? 'In Progress'
                        : 'Lobby Open'
                      : selectedSlot?.isEnded
                        ? 'Ended'
                        : 'Ready to Open'
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

            <Text style={styles.modalNotice} maxFontSizeMultiplier={1.15}>
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
                style={{ flex: 1 }}
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
                  backgroundColor: selectedSlot?.isEnded ? '#003366' : '#28A745',
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
  headerBlock: { gap: 12, marginBottom: 8 },
  intro: { fontSize: 13, lineHeight: 20, color: '#64748B', fontWeight: '500' },
  packCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.card,
  },
  packRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  packIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  packTitle: { fontSize: 14, fontWeight: '800', color: '#003366', marginBottom: 2 },
  packSub: { fontSize: 12, fontWeight: '600', color: '#64748B' },

  // DIRECT ROOM MODAL STYLING
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    ...shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  modalIconWrap: {
    width: 46,
    height: 46,
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
    marginTop: 2,
    fontWeight: '500',
  },
  detailTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#64748B',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003366',
    flexShrink: 1,
    textAlign: 'right',
  },
  detailValueBold: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003366',
  },
  modalNotice: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
