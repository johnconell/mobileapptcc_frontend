import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TextInput,
  Pressable,
  BackHandler,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  User,
  Calendar,
  Clock,
  Award,
  Layers,
  Check,
  DoorOpen,
  ChevronRight,
  ArrowLeft,
  Users,
} from 'lucide-react-native';
import { Header, Card, Button } from '@/components/ui';
import { OfflineStore, type OfflineQueuedResult, type OfflinePack } from '@/services/offlineStore';
import { colors, radii, shadows } from '@/theme';

type LobbyStudentItem = {
  id: string;
  applicantCode: string;
  name: string;
  course: string;
  score: number | null;
  itemsCorrect: number | null;
  itemsTotal: number | null;
  status: 'passed' | 'failed' | 'in_progress' | 'enrolled';
  statusLabel: string;
  synced: boolean;
};

type ExamLobby = {
  id: string;
  scheduleId: number;
  roomId: number;
  roomName: string;
  roomCode: string;
  scheduleTitle: string;
  examDate: string;
  timeSlot: string;
  status: 'lobby_open' | 'in_progress' | 'ended' | 'scheduled';
  statusLabel: string;
  studentCount: number;
  passedCount: number;
  failedCount: number;
  averageScore: number | null;
  students: LobbyStudentItem[];
};

export default function ProctorResultsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [rawResults, setRawResults] = useState<OfflineQueuedResult[]>([]);
  const [openedRooms, setOpenedRooms] = useState<
    Record<string, { code: string; openedAt: string; status: 'lobby_open' | 'in_progress' | 'ended' }>
  >({});

  // Navigation state within Results: select a lobby to drill down into its examinees
  const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null);

  // Search & Filter state
  const [lobbySearch, setLobbySearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState<'all' | 'passed' | 'failed' | 'enrolled'>('all');

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [cachedPack, queued, opened] = await Promise.all([
        OfflineStore.getPack(),
        OfflineStore.getResults(),
        OfflineStore.getOpenedRooms(),
      ]);

      setPack(cachedPack);
      setRawResults(queued);
      setOpenedRooms(opened);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // HIERARCHICAL NAVIGATION: Hardware back button returns from Level 2 to Level 1, or Level 1 to Dashboard
  // HIERARCHICAL NAVIGATION: Hardware back button returns from Level 2 to Level 1, or Level 1 to previous screen / Dashboard
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedLobbyId) {
        setSelectedLobbyId(null);
        return true;
      }
      router.navigate('/(proctor)/dashboard' as any);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.navigate('/(proctor)/dashboard' as any);
      }
      return true;
    });
    return () => sub.remove();
  }, [selectedLobbyId, router]);

  // Build the list of examination lobbies from opened rooms and cached schedules
  const lobbies = useMemo<ExamLobby[]>(() => {
    const list: ExamLobby[] = [];
    const passingPercentage =
      (pack as any)?.grading_settings?.[0]?.passing_percentage ?? 75;

    // Results indexed by applicant_code upper-case
    const resultsByCode = new Map<string, OfflineQueuedResult>();
    for (const r of rawResults) {
      if (r.applicant_code) {
        resultsByCode.set(r.applicant_code.toUpperCase(), r);
      }
    }

    // Applicants indexed by applicant_code upper-case
    const applicantMap = new Map<string, NonNullable<OfflinePack['applicants']>[0]>();
    for (const a of pack?.applicants ?? []) {
      if (a.applicant_code) {
        applicantMap.set(a.applicant_code.toUpperCase(), a);
      }
    }

    // Registrations indexed by schedule ID
    const regBySchedule = new Map<number, NonNullable<OfflinePack['registrations']>>();
    for (const reg of pack?.registrations ?? []) {
      const arr = regBySchedule.get(reg.examination_schedule_id) || [];
      arr.push(reg);
      regBySchedule.set(reg.examination_schedule_id, arr);
    }

    // 1. Process opened rooms first
    const processedKeys = new Set<string>();

    for (const [key, opened] of Object.entries(openedRooms)) {
      processedKeys.add(key);
      const [schedIdNum, rmIdNum] = key.split(':').map(Number);
      const sched = pack?.schedules?.find((s) => s.id === schedIdNum);
      const rm = sched?.rooms?.find((r) => r.id === rmIdNum);

      const roomName = rm?.room_name || `Room ${opened.code}`;
      const scheduleTitle =
        sched?.title?.replace(/Entrance\s+Examination/gi, '').trim() ||
        sched?.title ||
        'Entrance Examination';
      const examDate = sched?.exam_date || 'Testing Session';
      const timeSlot = sched?.start_time
        ? `${sched.start_time.slice(0, 5)} - ${(sched.end_time || '').slice(0, 5)}`
        : '09:30 AM - 10:30 AM';

      // Find examinees for this lobby
      const students: LobbyStudentItem[] = [];
      const scheduledRegs = regBySchedule.get(schedIdNum) || [];

      // Check if examinees have completed results
      for (const reg of scheduledRegs) {
        const app = (pack?.applicants ?? []).find((a) => a.id === reg.applicant_id);
        const codeUpper = (app?.applicant_code || '').toUpperCase();
        const res = resultsByCode.get(codeUpper);

        if (res) {
          const isPass = Number(res.score) >= passingPercentage;
          students.push({
            id: res.local_id || String(reg.id),
            applicantCode: res.applicant_code,
            name: res.applicant_name || app?.name || 'Examinee',
            course: app?.course_applied || 'General Admission',
            score: res.score,
            itemsCorrect: res.items_correct ?? null,
            itemsTotal: res.items_total ?? null,
            status: isPass ? 'passed' : 'failed',
            statusLabel: isPass ? 'PASSED' : 'FAILED',
            synced: Boolean(res.synced),
          });
        } else {
          students.push({
            id: String(reg.id),
            applicantCode: app?.applicant_code || `APP-${reg.id}`,
            name: app?.name || 'Enrolled Candidate',
            course: app?.course_applied || 'General Admission',
            score: null,
            itemsCorrect: null,
            itemsTotal: null,
            status: opened.status === 'in_progress' ? 'in_progress' : 'enrolled',
            statusLabel: opened.status === 'in_progress' ? 'TAKING EXAM' : 'IN LOBBY',
            synced: false,
          });
        }
      }

      // If scheduledRegs is empty, check rawResults for this schedule
      if (students.length === 0) {
        const schedResults = rawResults.filter((r) => r.examination_schedule_id === schedIdNum);
        for (const res of schedResults) {
          const isPass = Number(res.score) >= passingPercentage;
          const app = applicantMap.get((res.applicant_code || '').toUpperCase());
          students.push({
            id: res.local_id,
            applicantCode: res.applicant_code,
            name: res.applicant_name || app?.name || res.applicant_code,
            course: app?.course_applied || 'General Admission',
            score: res.score,
            itemsCorrect: res.items_correct ?? null,
            itemsTotal: res.items_total ?? null,
            status: isPass ? 'passed' : 'failed',
            statusLabel: isPass ? 'PASSED' : 'FAILED',
            synced: Boolean(res.synced),
          });
        }
      }

      // If still empty but we have pack applicants, populate with default roster
      if (students.length === 0 && (pack?.applicants?.length ?? 0) > 0) {
        for (const app of (pack?.applicants ?? []).slice(0, 30)) {
          const res = resultsByCode.get((app.applicant_code || '').toUpperCase());
          if (res) {
            const isPass = Number(res.score) >= passingPercentage;
            students.push({
              id: res.local_id,
              applicantCode: app.applicant_code,
              name: app.name,
              course: app.course_applied || 'General Admission',
              score: res.score,
              itemsCorrect: res.items_correct ?? null,
              itemsTotal: res.items_total ?? null,
              status: isPass ? 'passed' : 'failed',
              statusLabel: isPass ? 'PASSED' : 'FAILED',
              synced: Boolean(res.synced),
            });
          } else {
            students.push({
              id: String(app.id),
              applicantCode: app.applicant_code,
              name: app.name,
              course: app.course_applied || 'General Admission',
              score: null,
              itemsCorrect: null,
              itemsTotal: null,
              status: 'enrolled',
              statusLabel: 'IN LOBBY',
              synced: false,
            });
          }
        }
      }

      const passed = students.filter((s) => s.status === 'passed').length;
      const failed = students.filter((s) => s.status === 'failed').length;
      const completedStudents = students.filter((s) => s.score != null);
      const avgScore =
        completedStudents.length > 0
          ? completedStudents.reduce((acc, s) => acc + (s.score || 0), 0) /
            completedStudents.length
          : null;

      list.push({
        id: key,
        scheduleId: schedIdNum,
        roomId: rmIdNum,
        roomName,
        roomCode: opened.code,
        scheduleTitle,
        examDate,
        timeSlot,
        status: opened.status,
        statusLabel:
          opened.status === 'in_progress'
            ? 'IN PROGRESS'
            : opened.status === 'lobby_open'
              ? 'LOBBY OPEN'
              : 'ENDED',
        studentCount: students.length,
        passedCount: passed,
        failedCount: failed,
        averageScore: avgScore,
        students,
      });
    }

    // 2. Also add schedules/rooms from the pack if not already processed
    if (pack?.schedules?.length) {
      for (const sched of pack.schedules) {
        for (const rm of sched.rooms || []) {
          const key = `${sched.id}:${rm.id}`;
          if (processedKeys.has(key)) continue;

          const scheduleTitle =
            sched.title?.replace(/Entrance\s+Examination/gi, '').trim() ||
            sched.title ||
            'General Examination';
          const examDate = sched.exam_date || 'Scheduled Cycle';
          const timeSlot = sched.start_time
            ? `${sched.start_time.slice(0, 5)} - ${(sched.end_time || '').slice(0, 5)}`
            : '09:30 AM - 10:30 AM';

          // Gather examinees for this scheduled room
          const students: LobbyStudentItem[] = [];
          const scheduledRegs = regBySchedule.get(sched.id) || [];

          for (const reg of scheduledRegs) {
            const app = (pack.applicants || []).find((a) => a.id === reg.applicant_id);
            const codeUpper = (app?.applicant_code || '').toUpperCase();
            const res = resultsByCode.get(codeUpper);

            if (res) {
              const isPass = Number(res.score) >= passingPercentage;
              students.push({
                id: res.local_id || String(reg.id),
                applicantCode: res.applicant_code,
                name: res.applicant_name || app?.name || 'Examinee',
                course: app?.course_applied || 'General Admission',
                score: res.score,
                itemsCorrect: res.items_correct ?? null,
                itemsTotal: res.items_total ?? null,
                status: isPass ? 'passed' : 'failed',
                statusLabel: isPass ? 'PASSED' : 'FAILED',
                synced: Boolean(res.synced),
              });
            } else {
              students.push({
                id: String(reg.id),
                applicantCode: app?.applicant_code || `APP-${reg.id}`,
                name: app?.name || 'Enrolled Candidate',
                course: app?.course_applied || 'General Admission',
                score: null,
                itemsCorrect: null,
                itemsTotal: null,
                status: 'enrolled',
                statusLabel: 'SCHEDULED',
                synced: false,
              });
            }
          }

          const passed = students.filter((s) => s.status === 'passed').length;
          const failed = students.filter((s) => s.status === 'failed').length;
          const completedStudents = students.filter((s) => s.score != null);
          const avgScore =
            completedStudents.length > 0
              ? completedStudents.reduce((acc, s) => acc + (s.score || 0), 0) /
                completedStudents.length
              : null;

          list.push({
            id: key,
            scheduleId: sched.id,
            roomId: rm.id,
            roomName: rm.room_name,
            roomCode: `RM-${rm.id}`,
            scheduleTitle,
            examDate,
            timeSlot,
            status: 'scheduled',
            statusLabel: 'SCHEDULED',
            studentCount: students.length,
            passedCount: passed,
            failedCount: failed,
            averageScore: avgScore,
            students,
          });
        }
      }
    }

    return list;
  }, [pack, rawResults, openedRooms]);

  // Selected Lobby Object
  const selectedLobby = useMemo(() => {
    if (!selectedLobbyId) return null;
    return lobbies.find((l) => l.id === selectedLobbyId) || null;
  }, [lobbies, selectedLobbyId]);

  // Filtered Lobbies for Level 1 View
  const filteredLobbies = useMemo(() => {
    if (!lobbySearch.trim()) return lobbies;
    const q = lobbySearch.toLowerCase().trim();
    return lobbies.filter(
      (l) =>
        l.roomName.toLowerCase().includes(q) ||
        l.roomCode.toLowerCase().includes(q) ||
        l.scheduleTitle.toLowerCase().includes(q),
    );
  }, [lobbies, lobbySearch]);

  // Filtered Students for Level 2 (Selected Lobby) View
  const filteredStudents = useMemo(() => {
    if (!selectedLobby) return [];
    return selectedLobby.students.filter((s) => {
      // Filter tab
      if (studentFilter === 'passed' && s.status !== 'passed') return false;
      if (studentFilter === 'failed' && s.status !== 'failed') return false;
      if (studentFilter === 'enrolled' && s.status !== 'enrolled' && s.status !== 'in_progress')
        return false;

      // Search query
      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase().trim();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesCode = s.applicantCode.toLowerCase().includes(q);
        const matchesCourse = s.course.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesCourse;
      }
      return true;
    });
  }, [selectedLobby, studentFilter, studentSearch]);

  const getStatusColor = (status: string) => {
    if (status === 'lobby_open' || status === 'in_progress') return '#28A745';
    if (status === 'ended') return '#003366';
    return '#64748B';
  };

  // =========================================================================
  // VIEW 2: LEVEL 2 - EXAMINEES IN THE SELECTED LOBBY
  // =========================================================================
  if (selectedLobby) {
    return (
      <View style={styles.screen}>
        <Header
          title={selectedLobby.roomName}
          subtitle={`${selectedLobby.scheduleTitle} · Examinees`}
          onBack={() => setSelectedLobbyId(null)}
        />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#003366" />
          }
        >
          {/* BACK TO LOBBIES BAR */}
          <Pressable
            style={styles.backToLobbiesBtn}
            onPress={() => setSelectedLobbyId(null)}
          >
            <ArrowLeft size={16} color="#0055A4" />
            <Text style={styles.backToLobbiesText} maxFontSizeMultiplier={1.15}>
              Back to Examination Lobbies
            </Text>
          </Pressable>

          {/* LOBBY SUMMARY BANNER */}
          <View style={styles.lobbyDetailBanner}>
            <View style={styles.bannerHeader}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: getStatusColor(selectedLobby.status) + '18' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: getStatusColor(selectedLobby.status) },
                    ]}
                    maxFontSizeMultiplier={1.15}
                  >
                    {selectedLobby.statusLabel}
                  </Text>
                </View>
                <View style={styles.passGradeBadge}>
                  <Award size={12} color="#D97706" />
                  <Text style={styles.passGradeText}>Passing: 75.0%</Text>
                </View>
              </View>
            </View>

            <Text style={styles.lobbyBannerTitle} maxFontSizeMultiplier={1.2}>
              {selectedLobby.roomName} · Access Code: {selectedLobby.roomCode}
            </Text>
            <Text style={styles.lobbyBannerSub} maxFontSizeMultiplier={1.15}>
              {selectedLobby.scheduleTitle}
            </Text>

            <View style={styles.bannerMetaRow}>
              <View style={styles.bannerMetaItem}>
                <Calendar size={13} color="#0055A4" />
                <Text style={styles.bannerMetaText}>{selectedLobby.examDate}</Text>
              </View>
              <View style={styles.bannerMetaItem}>
                <Clock size={13} color="#0055A4" />
                <Text style={styles.bannerMetaText}>{selectedLobby.timeSlot}</Text>
              </View>
            </View>
          </View>

          {/* 4 STAT CARDS FOR THIS LOBBY */}
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              {/* Total Examinees */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#EBF3FE' }]}>
                  <Users size={20} color="#0055A4" />
                </View>
                <View style={styles.statContent}>
                  <Text style={styles.statValue} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {selectedLobby.studentCount}
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                    Examinees in Lobby
                  </Text>
                </View>
              </View>

              {/* Passed */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#E6F4EA' }]}>
                  <CheckCircle2 size={20} color="#28A745" />
                </View>
                <View style={styles.statContent}>
                  <Text style={styles.statValue} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {selectedLobby.passedCount}
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                    Passed Candidates
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              {/* Failed */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <XCircle size={20} color="#DC3545" />
                </View>
                <View style={styles.statContent}>
                  <Text style={styles.statValue} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {selectedLobby.failedCount}
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                    Failed Candidates
                  </Text>
                </View>
              </View>

              {/* Avg Score */}
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Award size={20} color="#D97706" />
                </View>
                <View style={styles.statContent}>
                  <Text style={styles.statValue} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {selectedLobby.averageScore != null
                      ? `${selectedLobby.averageScore.toFixed(1)}%`
                      : '—'}
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                    Average Score
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* SEARCH & FILTERS */}
          <View style={styles.searchBlock}>
            <View style={styles.searchBar}>
              <Search size={18} color="#64748B" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search student by name or code…"
                placeholderTextColor="#94A3B8"
                value={studentSearch}
                onChangeText={setStudentSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.filterPills}>
              <Pressable
                style={[styles.pill, studentFilter === 'all' && styles.pillActive]}
                onPress={() => setStudentFilter('all')}
              >
                <Text
                  style={[styles.pillText, studentFilter === 'all' && styles.pillTextActive]}
                  maxFontSizeMultiplier={1.15}
                >
                  All ({selectedLobby.students.length})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.pill, studentFilter === 'passed' && styles.pillActivePass]}
                onPress={() => setStudentFilter('passed')}
              >
                <Text
                  style={[styles.pillText, studentFilter === 'passed' && styles.pillTextPass]}
                  maxFontSizeMultiplier={1.15}
                >
                  Passed ({selectedLobby.passedCount})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.pill, studentFilter === 'failed' && styles.pillActiveFail]}
                onPress={() => setStudentFilter('failed')}
              >
                <Text
                  style={[styles.pillText, studentFilter === 'failed' && styles.pillTextFail]}
                  maxFontSizeMultiplier={1.15}
                >
                  Failed ({selectedLobby.failedCount})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.pill, studentFilter === 'enrolled' && styles.pillActiveEnrolled]}
                onPress={() => setStudentFilter('enrolled')}
              >
                <Text
                  style={[styles.pillText, studentFilter === 'enrolled' && styles.pillTextEnrolled]}
                  maxFontSizeMultiplier={1.15}
                >
                  In Lobby (
                  {
                    selectedLobby.students.filter(
                      (s) => s.status === 'enrolled' || s.status === 'in_progress',
                    ).length
                  }
                  )
                </Text>
              </Pressable>
            </View>
          </View>

          {/* STUDENTS LIST */}
          <View style={styles.listHeaderRow}>
            <Text style={styles.groupHeading} maxFontSizeMultiplier={1.2}>
              Students in this Lobby
            </Text>
            <Text style={styles.resultCount} maxFontSizeMultiplier={1.15}>
              {filteredStudents.length} examinees
            </Text>
          </View>

          {filteredStudents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Layers size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No matching students in this lobby</Text>
              <Text style={styles.emptySub}>
                Try adjusting your search query or filter tab.
              </Text>
            </View>
          ) : (
            filteredStudents.map((student) => (
              <View key={student.id} style={styles.studentCard}>
                <View style={styles.studentRow}>
                  {/* Avatar Icon */}
                  <View
                    style={[
                      styles.avatarWrap,
                      student.status === 'passed'
                        ? styles.avatarPass
                        : student.status === 'failed'
                          ? styles.avatarFail
                          : styles.avatarEnrolled,
                    ]}
                  >
                    <User
                      size={20}
                      color={
                        student.status === 'passed'
                          ? '#28A745'
                          : student.status === 'failed'
                            ? '#DC3545'
                            : '#0055A4'
                      }
                    />
                  </View>

                  {/* Student Details */}
                  <View style={styles.studentInfo}>
                    <Text
                      style={styles.studentName}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                    >
                      {student.name}
                    </Text>
                    <View style={styles.studentMetaRow}>
                      <Text
                        style={styles.studentCode}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {student.applicantCode}
                      </Text>
                      <Text style={styles.studentDot}>•</Text>
                      <Text
                        style={styles.studentCourse}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.15}
                      >
                        {student.course}
                      </Text>
                    </View>

                    {student.itemsCorrect != null && student.itemsTotal != null && (
                      <Text style={styles.itemScoreText} maxFontSizeMultiplier={1.15}>
                        {student.itemsCorrect} / {student.itemsTotal} items correct
                      </Text>
                    )}
                  </View>

                  {/* Score & Status Badge */}
                  <View style={styles.scoreContainer}>
                    {student.score != null ? (
                      <Text
                        style={[
                          styles.scoreText,
                          student.status === 'passed' ? styles.scorePass : styles.scoreFail,
                        ]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {Number(student.score).toFixed(1)}%
                      </Text>
                    ) : (
                      <Text style={styles.scorePending} maxFontSizeMultiplier={1.15}>
                        Pending
                      </Text>
                    )}

                    <View
                      style={[
                        styles.statusPill,
                        student.status === 'passed'
                          ? styles.statusPillPass
                          : student.status === 'failed'
                            ? styles.statusPillFail
                            : styles.statusPillEnrolled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          student.status === 'passed'
                            ? styles.statusTextPass
                            : student.status === 'failed'
                              ? styles.statusTextFail
                              : styles.statusTextEnrolled,
                        ]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {student.statusLabel}
                      </Text>
                    </View>

                    {student.synced && (
                      <View style={styles.syncedIndicator}>
                        <Check size={10} color="#28A745" />
                        <Text style={styles.syncedText}>Synced</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // =========================================================================
  // VIEW 1: LEVEL 1 - LIST OF RECENT EXAMINATION LOBBIES
  // =========================================================================
  return (
    <View style={styles.screen}>
      <Header
        title="Examination Results"
        subtitle="Recent Examination Lobbies"
        onBack={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.navigate('/(proctor)/dashboard' as any);
          }
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#003366" />
        }
      >
        {/* BANNER */}
        <View style={styles.examBanner}>
          <View style={styles.bannerHeader}>
            <View style={styles.badgeRow}>
              <View style={styles.recentPill}>
                <Text style={styles.recentPillText}>RECENT EXAMINATION LOBBIES</Text>
              </View>
              <View style={styles.passGradeBadge}>
                <Award size={12} color="#D97706" />
                <Text style={styles.passGradeText}>Passing Threshold: 75.0%</Text>
              </View>
            </View>
          </View>

          <Text style={styles.bannerTitle} maxFontSizeMultiplier={1.2}>
            Select a Lobby to View Examinees
          </Text>
          <Text style={styles.bannerInstruction} maxFontSizeMultiplier={1.15}>
            Tap any examination room below to view all examinees, their full names, score percentages, and passed/failed statuses.
          </Text>
        </View>

        {/* SEARCH BAR FOR LOBBIES */}
        <View style={styles.searchBar}>
          <Search size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search lobby by room name or code…"
            placeholderTextColor="#94A3B8"
            value={lobbySearch}
            onChangeText={setLobbySearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* LOBBIES LIST */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.groupHeading} maxFontSizeMultiplier={1.2}>
            Available Examination Lobbies ({filteredLobbies.length})
          </Text>
        </View>

        {filteredLobbies.length === 0 ? (
          <View style={styles.emptyCard}>
            <Layers size={36} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No examination lobbies found</Text>
            <Text style={styles.emptySub}>
              No rooms or lobbies have been recorded yet. Launch a lobby from Examination tab.
            </Text>
            <Button
              title="Browse Examination Schedules"
              variant="outline"
              size="sm"
              onPress={() => router.push('/(proctor)/examination' as any)}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : (
          filteredLobbies.map((lobby) => (
            <Pressable
              key={lobby.id}
              style={styles.lobbyCard}
              onPress={() => setSelectedLobbyId(lobby.id)}
            >
              <View style={styles.lobbyCardTop}>
                {/* Lobby Icon */}
                <View
                  style={[
                    styles.lobbyIconWrap,
                    {
                      backgroundColor:
                        lobby.status === 'lobby_open' || lobby.status === 'in_progress'
                          ? '#E6F4EA'
                          : '#EBF3FE',
                    },
                  ]}
                >
                  <DoorOpen
                    size={22}
                    color={
                      lobby.status === 'lobby_open' || lobby.status === 'in_progress'
                        ? '#28A745'
                        : '#0055A4'
                    }
                  />
                </View>

                {/* Info */}
                <View style={styles.lobbyMeta}>
                  <View style={styles.lobbyTitleRow}>
                    <Text
                      style={styles.lobbyRoomName}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                    >
                      {lobby.roomName}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: getStatusColor(lobby.status) + '18' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          { color: getStatusColor(lobby.status) },
                        ]}
                        maxFontSizeMultiplier={1.15}
                      >
                        {lobby.statusLabel}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={styles.lobbyScheduleTitle}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                  >
                    {lobby.scheduleTitle}
                  </Text>

                  <View style={styles.lobbyDetailsRow}>
                    <Text style={styles.lobbyCodeText}>Code: {lobby.roomCode}</Text>
                    <Text style={styles.lobbyDot}>•</Text>
                    <Text style={styles.lobbyTimeText}>{lobby.timeSlot}</Text>
                  </View>
                </View>

                <ChevronRight size={20} color="#94A3B8" style={{ flexShrink: 0 }} />
              </View>

              {/* Bottom stats footer of the lobby card */}
              <View style={styles.lobbyCardFooter}>
                <View style={styles.lobbyFooterItem}>
                  <Users size={13} color="#0055A4" />
                  <Text style={styles.lobbyFooterText}>
                    <Text style={styles.lobbyFooterBold}>{lobby.studentCount}</Text> Examinees
                  </Text>
                </View>

                <View style={styles.lobbyFooterItem}>
                  <CheckCircle2 size={13} color="#28A745" />
                  <Text style={styles.lobbyFooterText}>
                    <Text style={[styles.lobbyFooterBold, { color: '#28A745' }]}>
                      {lobby.passedCount}
                    </Text>{' '}
                    Passed
                  </Text>
                </View>

                <View style={styles.lobbyFooterItem}>
                  <XCircle size={13} color="#DC3545" />
                  <Text style={styles.lobbyFooterText}>
                    <Text style={[styles.lobbyFooterBold, { color: '#DC3545' }]}>
                      {lobby.failedCount}
                    </Text>{' '}
                    Failed
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}

        {/* SYNC BUTTON */}
        <Button
          title="Sync Results to Administrator"
          variant="outline"
          size="md"
          fullWidth
          onPress={() => router.push('/offline-prepare' as any)}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  // Back to lobbies bar
  backToLobbiesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  backToLobbiesText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0055A4',
  },

  // Exam Banner
  examBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    ...shadows.card,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  recentPill: {
    backgroundColor: '#EBF3FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recentPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0055A4',
    letterSpacing: 0.5,
  },
  passGradeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  passGradeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#003366',
    marginTop: 2,
  },
  bannerInstruction: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    fontWeight: '500',
  },

  // Lobby Detail Banner (in Level 2)
  lobbyDetailBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    ...shadows.card,
  },
  lobbyBannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#003366',
  },
  lobbyBannerSub: {
    fontSize: 13,
    color: '#0055A4',
    fontWeight: '600',
  },
  bannerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 2,
  },
  bannerMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // Overview Stats (2-row solid layout)
  statsContainer: {
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    ...shadows.card,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#003366',
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },

  // Search & Filters
  searchBlock: {
    gap: 10,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#003366',
    fontWeight: '600',
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: {
    backgroundColor: '#003366',
    borderColor: '#003366',
  },
  pillActivePass: {
    backgroundColor: '#28A745',
    borderColor: '#28A745',
  },
  pillActiveFail: {
    backgroundColor: '#DC3545',
    borderColor: '#DC3545',
  },
  pillActiveEnrolled: {
    backgroundColor: '#0055A4',
    borderColor: '#0055A4',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTextPass: {
    color: '#FFFFFF',
  },
  pillTextFail: {
    color: '#FFFFFF',
  },
  pillTextEnrolled: {
    color: '#FFFFFF',
  },

  // List Headers
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: -4,
  },
  groupHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#003366',
  },
  resultCount: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },

  // LOBBY CARD (Level 1)
  lobbyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
    ...shadows.card,
  },
  lobbyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lobbyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lobbyMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  lobbyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  lobbyRoomName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#003366',
    flex: 1,
  },
  lobbyScheduleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0055A4',
  },
  lobbyDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  lobbyCodeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  lobbyDot: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  lobbyTimeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  lobbyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  lobbyFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lobbyFooterText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  lobbyFooterBold: {
    fontWeight: '700',
    color: '#003366',
  },

  // STUDENT CARD (Level 2)
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadows.card,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarPass: { backgroundColor: '#E6F4EA' },
  avatarFail: { backgroundColor: '#FEE2E2' },
  avatarEnrolled: { backgroundColor: '#EBF3FE' },
  studentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003366',
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  studentCode: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  studentDot: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  studentCourse: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  itemScoreText: {
    fontSize: 11,
    color: '#0055A4',
    fontWeight: '600',
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
    gap: 3,
    flexShrink: 0,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '900',
  },
  scorePass: {
    color: '#28A745',
  },
  scoreFail: {
    color: '#DC3545',
  },
  scorePending: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillPass: { backgroundColor: '#DCFCE7' },
  statusPillFail: { backgroundColor: '#FEE2E2' },
  statusPillEnrolled: { backgroundColor: '#EBF3FE' },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statusTextPass: { color: '#16A34A' },
  statusTextFail: { color: '#DC2626' },
  statusTextEnrolled: { color: '#0055A4' },
  syncedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  syncedText: {
    fontSize: 9,
    color: '#28A745',
    fontWeight: '700',
  },

  // Empty State
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#003366',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
