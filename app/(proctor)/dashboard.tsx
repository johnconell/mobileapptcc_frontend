import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Users,
  UserCheck,
  Award,
  Clock,
  DoorOpen,
  BarChart3,
  RefreshCw,
  Calendar,
  ShieldCheck,
  ChevronRight,
  BookOpen,
  X,
  User,
  GraduationCap,
  LogOut,
} from 'lucide-react-native';
import { Header, Button } from '@/components/ui';
import { useProctorStore } from '@/stores';
import { useAppTheme } from '@/hooks/useAppTheme';
import { OfflineStore } from '@/services/offlineStore';
import { AuthRepository } from '@/repositories';

type ActiveLobbyDetails = {
  sessionId: string;
  roomId: string;
  roomName: string;
  code: string;
  status: 'lobby_open' | 'in_progress' | 'ended';
};

export default function ProctorDashboardScreen() {
  const router = useRouter();
  const { colors, isDark, fontMultiplier } = useAppTheme();
  const profile = useProctorStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [activeLobby, setActiveLobby] = useState<ActiveLobbyDetails | null>(null);

  const [stats, setStats] = useState({
    totalApplicants: 48,
    examineesTaken: 42,
    todayRegistered: 48,
    passingGrade: '75.0%',
    duration: '60 mins',
    todayExamDate: new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    todayExamTitle: 'General Entrance Examination',
    venueRoom: 'Room CL 1 · Testing Center',
    status: 'SCHEDULED',
    startTime: '07:30 AM',
    endTime: '04:00 PM',
    timeWindowLabel: 'Starts 7:30 AM (Morning) - 4:00 PM (Noon)',
    questionCount: 60,
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [pack, opened, queued] = await Promise.all([
        OfflineStore.getPack(),
        OfflineStore.getOpenedRooms(),
        OfflineStore.getResults(),
      ]);

      const entries = Object.entries(opened);

      // Check for any active room
      const activeEntry = entries.find(
        ([_, r]) => r.status === 'lobby_open' || r.status === 'in_progress',
      ) || entries[0];

      let examTitle = 'Entrance Examination';
      let activeRoomName = 'Room CL 1';
      let activeCode = '';
      let activeStatus: 'lobby_open' | 'in_progress' | 'ended' = 'ended';
      let activeDetails: ActiveLobbyDetails | null = null;

      if (activeEntry) {
        const [schedId, rmId] = activeEntry[0].split(':');
        activeCode = activeEntry[1].code;
        activeStatus = activeEntry[1].status;
        activeRoomName = `Room ${activeCode}`;

        if (pack?.schedules?.length) {
          for (const s of pack.schedules) {
            if (String(s.id) === String(schedId)) {
              examTitle = s.title || examTitle;
              const rMatch = s.rooms?.find((r) => String(r.id) === String(rmId));
              if (rMatch) {
                activeRoomName = rMatch.room_name;
              }
              break;
            }
          }
        }

        activeDetails = {
          sessionId: schedId,
          roomId: rmId,
          roomName: activeRoomName,
          code: activeCode,
          status: activeStatus,
        };
      } else if (pack?.schedules?.length) {
        examTitle = pack.schedules[0].title || 'Entrance Examination';
        if (pack.schedules[0].rooms?.length) {
          activeRoomName = pack.schedules[0].rooms[0].room_name;
        }
      }

      setActiveLobby(activeDetails);

      // Registered applicants for today's examination
      let todayRegistered = 0;
      const primarySchedule = pack?.schedules?.[0];
      if (primarySchedule && pack?.registrations?.length) {
        const matching = pack.registrations.filter(
          (r) => r.examination_schedule_id === primarySchedule.id,
        );
        todayRegistered = matching.length;
      }
      if (!todayRegistered && pack?.applicants?.length) {
        todayRegistered = pack.applicants.length;
      }
      if (!todayRegistered) {
        todayRegistered = 48;
      }

      const durationMins = pack?.examination_settings?.duration_minutes ?? 60;
      const passingPercentage = (pack as any)?.grading_settings?.[0]?.passing_percentage ?? 75;
      const takenCount = queued.length > 0 ? queued.length : (pack?.registrations?.length ?? 42);

      setStats({
        totalApplicants: pack?.applicants?.length ?? 48,
        examineesTaken: takenCount,
        todayRegistered,
        passingGrade: `${Number(passingPercentage).toFixed(1)}%`,
        duration: `${durationMins} mins`,
        todayExamDate:
          primarySchedule?.exam_date ||
          new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        todayExamTitle:
          examTitle.replace(/Entrance\s+Examination/gi, '').trim() || 'Entrance Examination',
        venueRoom: activeDetails
          ? `${activeRoomName} · Code: ${activeCode}`
          : `${activeRoomName} · Main Campus`,
        status:
          activeStatus === 'in_progress'
            ? 'IN PROGRESS'
            : activeStatus === 'lobby_open'
              ? 'LOBBY OPEN'
              : 'TODAY',
        startTime: '07:30 AM',
        endTime: '04:00 PM',
        timeWindowLabel: 'Starts 7:30 AM (Morning) - 4:00 PM (Noon)',
        questionCount: 60,
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === 'LOBBY OPEN' || status === 'IN PROGRESS') return colors.success;
    if (status === 'TODAY' || status === 'SCHEDULED') return colors.accent;
    return colors.textMuted;
  };

  // Open Lobby: If active lobby exists, enters directly. If none, navigates to examination to pick room & open immediately!
  const handleOpenLobbyPress = () => {
    if (activeLobby) {
      const query = new URLSearchParams({
        sessionId: activeLobby.sessionId,
        roomId: activeLobby.roomId,
        roomName: activeLobby.roomName,
        roomCode: activeLobby.code,
        roomStatus: activeLobby.status,
      }).toString();
      router.push(`/(proctor)/lobby?${query}` as any);
    } else {
      router.push('/(proctor)/examination' as any);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out and return to the main landing page?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AuthRepository.logout();
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Dashboard"
        subtitle="Proctor Command Center"
        hideBackSlot
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={handleLogout}
            style={styles.signOutHeaderBtn}
            hitSlop={8}
          >
            <LogOut size={16} color={colors.danger} />
            <Text style={[styles.signOutHeaderText, { color: colors.danger }]} maxFontSizeMultiplier={fontMultiplier}>
              Sign Out
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadData}
            tintColor={colors.tabBarActive}
          />
        }
      >
        {/* 1. WELCOME CARD */}
        <View
          style={[
            styles.welcomeCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.welcomeInfo}>
            <Text
              style={[styles.welcomeLabel, { color: colors.textMuted }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Welcome Back,
            </Text>
            <Text
              style={[styles.welcomeName, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              {profile?.displayName || profile?.username || 'Proctor One'}
            </Text>
          </View>
          <View
            style={[
              styles.datetimeBox,
              { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.datetimeRow}>
              <Calendar size={13} color={colors.accent} />
              <Text
                style={[styles.dateText, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {currentTime.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
            <View style={styles.datetimeRow}>
              <Clock size={13} color={colors.accent} />
              <Text
                style={[styles.timeText, { color: colors.accent }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {currentTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. OVERVIEW METRICS (Total Examinees & Examinees Taken) */}
        <View style={styles.statsContainer}>
          {/* ROW 1 */}
          <View style={styles.statsRow}>
            {/* Total Examinees */}
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={[styles.statIconWrap, { backgroundColor: colors.accentMuted }]}>
                <Users size={20} color={colors.accent} />
              </View>
              <View style={styles.statContent}>
                <Text
                  style={[styles.statValue, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  {stats.totalApplicants}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Total Examinees
                </Text>
              </View>
            </View>

            {/* Overall Applicants Who Took Exam */}
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={[styles.statIconWrap, { backgroundColor: colors.successMuted }]}>
                <UserCheck size={20} color={colors.success} />
              </View>
              <View style={styles.statContent}>
                <Text
                  style={[styles.statValue, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  {stats.examineesTaken}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Examinees Taken
                </Text>
              </View>
            </View>
          </View>

          {/* ROW 2 */}
          <View style={styles.statsRow}>
            {/* Passing Grade */}
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={[styles.statIconWrap, { backgroundColor: colors.warningMuted }]}>
                <Award size={20} color={colors.warning} />
              </View>
              <View style={styles.statContent}>
                <Text
                  style={[styles.statValue, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  {stats.passingGrade}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Passing Grade
                </Text>
              </View>
            </View>

            {/* Exam Duration */}
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={[styles.statIconWrap, { backgroundColor: colors.accentMuted }]}>
                <Clock size={20} color={colors.accent} />
              </View>
              <View style={styles.statContent}>
                <Text
                  style={[styles.statValue, { color: colors.textPrimary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  {stats.duration}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Exam Duration
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 3. TODAY'S EXAMINATION CARD (With Registered Total Applicants) */}
        <View
          style={[
            styles.examCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.examCardHeader}>
            <View style={styles.todayPillWrap}>
              <Text
                style={[styles.sectionTitle, { color: colors.accent }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                TODAY'S EXAMINATION
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(stats.status) + '18' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: getStatusColor(stats.status) },
                ]}
              />
              <Text
                style={[styles.statusText, { color: getStatusColor(stats.status) }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {stats.status}
              </Text>
            </View>
          </View>

          <Text
            style={[styles.examTitle, { color: colors.textPrimary }]}
            numberOfLines={2}
            maxFontSizeMultiplier={fontMultiplier}
          >
            {stats.todayExamTitle}
          </Text>
          <Text
            style={[styles.roomName, { color: colors.textSecondary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={fontMultiplier}
          >
            {stats.venueRoom}
          </Text>

          {/* SCHEDULE DATE & TIME (Starts 7:30 AM Morning - 4:00 PM Noon) */}
          <View style={styles.scheduleTimeRow}>
            <View
              style={[
                styles.scheduleBadge,
                { backgroundColor: colors.accentMuted, borderColor: colors.cardBorder },
              ]}
            >
              <Calendar size={13} color={colors.accent} />
              <Text
                style={[styles.scheduleBadgeText, { color: colors.accent }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {stats.todayExamDate}
              </Text>
            </View>
            <View
              style={[
                styles.scheduleBadge,
                { backgroundColor: colors.warningMuted, borderColor: colors.cardBorder },
              ]}
            >
              <Clock size={13} color={colors.warning} />
              <Text
                style={[styles.scheduleBadgeText, { color: colors.warning }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Starts 7:30 AM (Morning) - 4:00 PM (Noon)
              </Text>
            </View>
          </View>

          {/* REGISTERED TOTAL APPLICANTS BANNER */}
          <View
            style={[
              styles.registeredBanner,
              { backgroundColor: colors.accentMuted, borderColor: colors.accent },
            ]}
          >
            <View style={styles.registeredBannerLeft}>
              <GraduationCap size={20} color={colors.accent} />
              <View>
                <Text
                  style={[styles.registeredLabel, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Registered Total Applicants
                </Text>
                <Text
                  style={[styles.registeredCount, { color: colors.accent }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  {stats.todayRegistered} Examinees Scheduled
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.registeredPill,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <Text
                style={[styles.registeredPillText, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                100% Ready
              </Text>
            </View>
          </View>

          {/* PARAMETER DETAILS GRID */}
          <View style={[styles.examMetaGrid, { borderTopColor: colors.cardBorder }]}>
            <View style={styles.metaItem}>
              <Text
                style={[styles.metaLabel, { color: colors.textMuted }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Start Time
              </Text>
              <Text
                style={[styles.metaValue, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {stats.startTime}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Text
                style={[styles.metaLabel, { color: colors.textMuted }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                End Time
              </Text>
              <Text
                style={[styles.metaValue, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {stats.endTime}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Text
                style={[styles.metaLabel, { color: colors.textMuted }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Duration
              </Text>
              <Text
                style={[styles.metaValue, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {stats.duration}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Text
                style={[styles.metaLabel, { color: colors.textMuted }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Passing Rate
              </Text>
              <Text
                style={[styles.metaValue, { color: colors.warning }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {stats.passingGrade}
              </Text>
            </View>
          </View>
        </View>

        {/* 4. RULES & REGULATIONS CARD */}
        <View
          style={[
            styles.rulesCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.rulesHeader}>
            <View style={[styles.rulesIconWrap, { backgroundColor: colors.accentMuted }]}>
              <ShieldCheck size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.rulesTitle, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Rules & Regulations
              </Text>
              <Text
                style={[styles.rulesSub, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Proctoring Standards & Examinee Guidelines
              </Text>
            </View>
          </View>

          <View style={styles.rulesList}>
            <View style={styles.ruleItem}>
              <Text style={[styles.ruleBullet, { color: colors.accent }]}>•</Text>
              <Text
                style={[styles.ruleText, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                <Text style={[styles.ruleBold, { color: colors.textPrimary }]}>
                  Verification:{' '}
                </Text>
                Examinees must scan proctor QR code or enter verified 6-digit access code.
              </Text>
            </View>

            <View style={styles.ruleItem}>
              <Text style={[styles.ruleBullet, { color: colors.accent }]}>•</Text>
              <Text
                style={[styles.ruleText, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                <Text style={[styles.ruleBold, { color: colors.textPrimary }]}>
                  Strict No-Device Policy:{' '}
                </Text>
                Smartphones, smartwatches, and unauthorized electronics are prohibited.
              </Text>
            </View>

            <View style={styles.ruleItem}>
              <Text style={[styles.ruleBullet, { color: colors.accent }]}>•</Text>
              <Text
                style={[styles.ruleText, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                <Text style={[styles.ruleBold, { color: colors.textPrimary }]}>
                  Duration & Timer:{' '}
                </Text>
                Session is strictly {stats.duration}; auto-submits when countdown reaches 00:00.
              </Text>
            </View>

            <View style={styles.ruleItem}>
              <Text style={[styles.ruleBullet, { color: colors.accent }]}>•</Text>
              <Text
                style={[styles.ruleText, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                <Text style={[styles.ruleBold, { color: colors.textPrimary }]}>
                  Passing Standard:{' '}
                </Text>
                Minimum qualifying score is {stats.passingGrade}.
              </Text>
            </View>

            <View style={styles.ruleItem}>
              <Text style={[styles.ruleBullet, { color: colors.accent }]}>•</Text>
              <Text
                style={[styles.ruleText, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                <Text style={[styles.ruleBold, { color: colors.textPrimary }]}>
                  Disconnection:{' '}
                </Text>
                Examinees can resume disconnected sessions via Proctor PIN without data loss.
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.viewFullRulesBtn, { borderTopColor: colors.cardBorder }]}
            onPress={() => setRulesModalOpen(true)}
          >
            <Text
              style={[styles.viewFullRulesText, { color: colors.accent }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              View Complete Examination Policy
            </Text>
            <ChevronRight size={16} color={colors.accent} />
          </Pressable>
        </View>

        {/* 5. QUICK ACTIONS (Open Lobby, Recent Exam, Sync & Pack, Account) */}
        <Text
          style={[styles.groupHeading, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={fontMultiplier}
        >
          Quick Actions
        </Text>

        <View style={styles.actionsGrid}>
          {/* ACTION 1: OPEN LOBBY (Always clickable, enters lobby or takes to room picker) */}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
              activeLobby && {
                borderColor: colors.success,
                backgroundColor: colors.successMuted,
              },
            ]}
            onPress={handleOpenLobbyPress}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            android_ripple={{ color: colors.cardBorder }}
            accessibilityRole="button"
          >
            <View
              style={[
                styles.actionIcon,
                { backgroundColor: activeLobby ? colors.success : colors.accent },
              ]}
            >
              <DoorOpen size={20} color="#FFFFFF" />
            </View>
            <Text
              style={[styles.actionText, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Open Lobby
            </Text>
            {activeLobby && (
              <View
                style={[
                  styles.activeLobbyBadge,
                  { backgroundColor: colors.successMuted },
                ]}
              >
                <View
                  style={[styles.activePulseDot, { backgroundColor: colors.success }]}
                />
                <Text
                  style={[styles.activeLobbyBadgeText, { color: colors.success }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Active
                </Text>
              </View>
            )}
          </Pressable>

          {/* ACTION 2: RECENT EXAMINATION */}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
            onPress={() => router.push('/(proctor)/results' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            android_ripple={{ color: colors.cardBorder }}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.accent }]}>
              <BarChart3 size={20} color="#FFFFFF" />
            </View>
            <Text
              style={[styles.actionText, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Recent Exam
            </Text>
          </Pressable>

          {/* ACTION 3: SYNC & PACK (Merged Sync Exam and Exam Pack) */}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
            onPress={() => router.push('/offline-prepare' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            android_ripple={{ color: colors.cardBorder }}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.warning }]}>
              <RefreshCw size={20} color="#FFFFFF" />
            </View>
            <Text
              style={[styles.actionText, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Sync & Pack
            </Text>
          </Pressable>

          {/* ACTION 4: ACCOUNT SETTINGS (New action requested) */}
          <Pressable
            style={[
              styles.actionBtn,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
            onPress={() =>
              router.push({
                pathname: '/(proctor)/account',
                params: { from: 'dashboard' },
              } as any)
            }
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            android_ripple={{ color: colors.cardBorder }}
            accessibilityRole="button"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#7C3AED' }]}>
              <ShieldCheck size={20} color="#FFFFFF" />
            </View>
            <Text
              style={[styles.actionText, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Account
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* FULL RULES & REGULATIONS MODAL */}
      <Modal
        visible={rulesModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRulesModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <BookOpen size={22} color={colors.accent} />
                <Text
                  style={[styles.modalTitle, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Examination Rules & Policy
                </Text>
              </View>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setRulesModalOpen(false)}
                hitSlop={10}
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalScrollBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.policyBlock}>
                <Text
                  style={[styles.policyHeading, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  1. Candidate Authentication & Passkey Verification
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  All examinees must verify their registration using the proctor's QR code or 6-digit access code. Examinees must present official identification matching their registration records before entering the room.
                </Text>
              </View>

              <View style={styles.policyBlock}>
                <Text
                  style={[styles.policyHeading, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  2. Strict Unauthorized Electronics Policy
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Smartphones (other than the testing device), smartwatches, earphones, Bluetooth peripherals, and secondary computers are strictly banned. Detection will trigger immediate session termination.
                </Text>
              </View>

              <View style={styles.policyBlock}>
                <Text
                  style={[styles.policyHeading, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  3. Examination Timing & Automatic Submission
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Standard testing window is strictly {stats.duration}. The offline local server enforces synchronized countdowns. When remaining time reaches 00:00, student responses are automatically locked and queued for grading.
                </Text>
              </View>

              <View style={styles.policyBlock}>
                <Text
                  style={[styles.policyHeading, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  4. Institutional Passing Standard ({stats.passingGrade})
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  The qualifying passing benchmark is set at {stats.passingGrade}. All objective item scores are processed automatically upon submission. Results are cached locally and synchronized with the central database.
                </Text>
              </View>

              <View style={styles.policyBlock}>
                <Text
                  style={[styles.policyHeading, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  5. Disconnection Handling & Reconnection Code
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  In the event of accidental device reboot or Wi-Fi disconnection, answers are saved locally on the client. Examinees can rejoin the lobby by requesting the 6-digit Proctor Reconnection Code without penalty.
                </Text>
              </View>
            </ScrollView>

            <Button
              title="Close Policy"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setRulesModalOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  // Welcome Card
  welcomeCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  welcomeInfo: { flex: 1, gap: 2 },
  welcomeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  welcomeName: { fontSize: 17, fontWeight: '800' },
  datetimeBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  datetimeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { fontSize: 11, fontWeight: '600' },
  timeText: { fontSize: 11, fontWeight: '800' },

  // 2x2 Metric Cards
  statsContainer: { gap: 10 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statContent: { flex: 1, minWidth: 0, justifyContent: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', lineHeight: 22 },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 1 },

  // Today's Examination Card
  examCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  examCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  examTitle: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  roomName: { fontSize: 12, fontWeight: '600', marginBottom: 2 },

  // Schedule Date & Time Row
  scheduleTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  scheduleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Registered Total Applicants Banner
  registeredBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  registeredBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  registeredLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  registeredCount: {
    fontSize: 13,
    fontWeight: '800',
  },
  registeredPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  registeredPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  examMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  metaItem: { alignItems: 'center' },
  metaLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  metaValue: { fontSize: 13, fontWeight: '800' },

  // Rules & Regulations Card
  rulesCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  rulesHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rulesIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rulesTitle: { fontSize: 15, fontWeight: '800' },
  rulesSub: { fontSize: 12, fontWeight: '500' },
  rulesList: { gap: 6, paddingVertical: 4 },
  ruleItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  ruleBullet: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  ruleText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  ruleBold: { fontWeight: '700' },
  viewFullRulesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
    borderTopWidth: 1,
    marginTop: 2,
  },
  viewFullRulesText: { fontSize: 12, fontWeight: '700' },

  // Quick Actions (4 Equal Columns)
  groupHeading: { fontSize: 16, fontWeight: '800', marginTop: 6, marginBottom: -4 },
  actionsGrid: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
    position: 'relative',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  activeLobbyBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 999,
  },
  activePulseDot: { width: 5, height: 5, borderRadius: 2.5 },
  activeLobbyBadgeText: { fontSize: 8, fontWeight: '800' },

  // Rules Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    maxHeight: '85%',
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalHeaderTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  closeBtn: { padding: 4 },
  modalScrollBody: { gap: 14, paddingVertical: 8 },
  policyBlock: { gap: 4 },
  policyHeading: { fontSize: 13, fontWeight: '700' },
  policyText: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  signOutHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF444430',
    backgroundColor: '#EF444410',
  },
  signOutHeaderText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
