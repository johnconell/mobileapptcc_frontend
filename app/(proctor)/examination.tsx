import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { DownloadCloud, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { Header, Card, Button, EmptyState, Breadcrumbs } from '@/components/ui';
import { ScheduleCard } from '@/features/proctor/ScheduleCard';
import { useSchedules } from '@/hooks/useRepositories';
import { AuthRepository } from '@/repositories';
import { QUERY_KEYS } from '@/constants';
import { useProctorStore } from '@/stores';
import { ensureExamPackCached } from '@/services/ensureExamPack';
import { OfflineStore } from '@/services/offlineStore';
import { shadows } from '@/theme';
import type { ExamSchedule, ExamSession } from '@/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type PackSummary = Awaited<ReturnType<typeof OfflineStore.getPackSummary>>;

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

  const refreshPackData = async () => {
    const [summary, today] = await Promise.all([
      OfflineStore.getPackSummary(),
      OfflineStore.isPackDownloadedToday(),
    ]);
    setPack(summary);
    setTodayStatus(today);
  };

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
  }, []);

  // HIERARCHICAL NAVIGATION: Back button and hardware back press return to Dashboard
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.navigate('/(proctor)/dashboard' as any);
      return true;
    });
    return () => sub.remove();
  }, [router]);

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

  const handleSelectTimeSlot = (schedule: ExamSchedule, session: ExamSession) => {
    setSelectedSchedule(schedule);
    setSelectedSession(session);
    router.push({
      pathname: '/(proctor)/rooms' as any,
      params: {
        sessionId: session.id,
        scheduleId: schedule.id,
      },
    });
  };

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
      />

      {/* BREADCRUMBS: Step 3 */}
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
              Tap any schedule below to expand available time slots. Selecting a time slot will load assigned rooms.
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
            onSelectTimeSlot={(session) => handleSelectTimeSlot(item, session)}
          />
        )}
      />
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
});
