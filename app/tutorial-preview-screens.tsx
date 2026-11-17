import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';
import { Wifi, Lock, ArrowLeft, MoreVertical, Check, Info, ShieldCheck, ChevronRight, Settings } from 'lucide-react-native';

// Import Real Application Components
import HomeScreen from './index';
import JoinExaminationScreen from './(student)/scan';
import StudentPasskeyScreen from './(student)/passkey';
import StudentConfirmationScreen from './(student)/confirmation';
import StudentLobbyScreen from './(student)/lobby';
import ExamScreen from './(student)/exam';
import CompletedScreen from './(student)/completed';

// UI Dialogs
import { QuestionNavigatorSheet } from '@/shared/components/ui/QuestionNavigatorSheet';
import { SubmitConfirmDialog } from '@/shared/components/ui/SubmitConfirmDialog';

// Stores & Fixtures
import { useStudentStore } from '@/features/applicants/stores/studentStore';
import { useExamStore } from '@/features/examinations/stores/examStore';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';
import { OFFICIAL_100_QUESTIONS } from '@/features/local-testing/official100Questions';
import type { StudentRecord, ExamAnswer } from '@/shared/types';

const DEMO_STUDENT: StudentRecord = {
  id: '1',
  studentId: '2026-TCC-0419',
  firstName: 'Juan',
  middleName: 'Santos',
  lastName: 'Dela Cruz',
  fullName: 'Juan Dela Cruz',
  email: 'juandelacruz@gmail.com',
  programId: '1',
  programCode: 'BSIT',
  programName: 'BS Information Technology',
  sex: 'Male',
  avatarInitials: 'JD',
  registration_id: 10419,
};

const DEMO_LOBBY_DATA = {
  schedule: {
    id: '1',
    name: 'TCC Entrance Examination',
    title: 'TCC Entrance Examination',
    schoolYear: '2026-2027',
    examinationDate: '2026-11-13',
    batchCount: 1,
  },
  session: {
    id: '1',
    scheduleId: '1',
    timeLabel: '08:00 AM - 10:00 AM',
    startTime: '08:00:00',
    endTime: '10:00:00',
    venue: 'Science Bldg · Room 204',
    roomName: 'Science Bldg · Room 204',
    batchNumber: '1',
    registeredStudents: 35,
    durationMinutes: 60,
    totalQuestions: 100,
  },
};

/**
 * Authentic Android 13/14 Material You Wi-Fi Settings UI
 */
const AndroidWifiSettingsScreen: React.FC = () => {
  return (
    <View style={wifiStyles.container}>
      {/* Android Status Bar */}
      <View style={wifiStyles.statusBar}>
        <Text style={wifiStyles.statusTime}>09:41</Text>
        <View style={wifiStyles.statusIcons}>
          <Wifi size={14} color="#1F1F1F" />
          <View style={wifiStyles.batteryIcon}>
            <View style={wifiStyles.batteryLevel} />
          </View>
        </View>
      </View>

      {/* Settings Top Bar */}
      <View style={wifiStyles.appBar}>
        <ArrowLeft size={22} color="#1F1F1F" />
        <Text style={wifiStyles.appBarTitle}>Internet</Text>
        <MoreVertical size={20} color="#1F1F1F" />
      </View>

      <ScrollView style={wifiStyles.content} showsVerticalScrollIndicator={false}>
        {/* Wi-Fi Switch Row */}
        <View style={wifiStyles.switchRow}>
          <Text style={wifiStyles.switchLabel}>Wi-Fi</Text>
          <View style={wifiStyles.toggleActive}>
            <View style={wifiStyles.toggleThumb} />
          </View>
        </View>

        {/* Section: Connected Network */}
        <Text style={wifiStyles.sectionHeader}>CONNECTED</Text>
        <View style={wifiStyles.connectedCard}>
          <View style={wifiStyles.wifiIconCircle}>
            <Wifi size={22} color="#7A1F2B" strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={wifiStyles.connectedSsid}>TCC_EXAM_ROOM_01</Text>
            <View style={wifiStyles.connectedBadgeRow}>
              <View style={wifiStyles.greenDot} />
              <Text style={wifiStyles.connectedSub}>Connected without internet</Text>
            </View>
            <Text style={wifiStyles.offlineNotice}>
              ✓ Offline Exam Network · Proctor Host: 192.168.8.1
            </Text>
          </View>
          <Settings size={20} color="#71717A" />
        </View>

        {/* Network Details Card */}
        <View style={wifiStyles.detailsCard}>
          <View style={wifiStyles.detailRow}>
            <Text style={wifiStyles.detailKey}>Signal strength</Text>
            <Text style={wifiStyles.detailVal}>Excellent (-48 dBm)</Text>
          </View>
          <View style={wifiStyles.detailDivider} />
          <View style={wifiStyles.detailRow}>
            <Text style={wifiStyles.detailKey}>Security</Text>
            <Text style={wifiStyles.detailVal}>WPA2-Personal</Text>
          </View>
          <View style={wifiStyles.detailDivider} />
          <View style={wifiStyles.detailRow}>
            <Text style={wifiStyles.detailKey}>Frequency</Text>
            <Text style={wifiStyles.detailVal}>5 GHz</Text>
          </View>
          <View style={wifiStyles.detailDivider} />
          <View style={wifiStyles.detailRow}>
            <Text style={wifiStyles.detailKey}>Assigned IP</Text>
            <Text style={wifiStyles.detailVal}>192.168.8.145</Text>
          </View>
        </View>

        {/* Section: Available Networks */}
        <Text style={wifiStyles.sectionHeader}>AVAILABLE NETWORKS</Text>
        <View style={wifiStyles.networkItem}>
          <Wifi size={18} color="#71717A" />
          <Text style={wifiStyles.networkSsid}>TCC_CAMPUS_OFFICIAL</Text>
          <Lock size={14} color="#A1A1AA" />
        </View>
        <View style={wifiStyles.networkItem}>
          <Wifi size={18} color="#71717A" />
          <Text style={wifiStyles.networkSsid}>TCC_FACULTY_SECURE</Text>
          <Lock size={14} color="#A1A1AA" />
        </View>
        <View style={wifiStyles.networkItem}>
          <Wifi size={18} color="#71717A" />
          <Text style={wifiStyles.networkSsid}>TCC_LAB_204_BACKUP</Text>
          <Lock size={14} color="#A1A1AA" />
        </View>
      </ScrollView>
    </View>
  );
};

const wifiStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  statusBar: {
    height: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#F8F9FA',
  },
  statusTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batteryIcon: {
    width: 22,
    height: 11,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#1F1F1F',
    padding: 1,
    justifyContent: 'center',
  },
  batteryLevel: {
    width: '85%',
    height: '100%',
    backgroundColor: '#1F1F1F',
    borderRadius: 1,
  },
  appBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  toggleActive: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7A1F2B',
    padding: 3,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  connectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#7A1F2B',
    marginBottom: 12,
    shadowColor: '#7A1F2B',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  wifiIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDE8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedSsid: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F1F1F',
  },
  connectedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  connectedSub: {
    fontSize: 12.5,
    color: '#10B981',
    fontWeight: '600',
  },
  offlineNotice: {
    fontSize: 11,
    color: '#71717A',
    marginTop: 4,
    fontWeight: '500',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailKey: {
    fontSize: 13,
    color: '#6B7280',
  },
  detailVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  networkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    gap: 12,
  },
  networkSsid: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
});

export default function TutorialPreviewScreens() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();
  const [ready, setReady] = useState(false);

  // Prepare standard demonstration answers & flags for 100 questions
  const demoAnswers: Record<string, ExamAnswer> = {};
  const demoFlags: Record<string, boolean> = {};

  // Mark first 98 questions as answered, 2 unanswered (Q99, Q100)
  for (let i = 1; i <= 98; i++) {
    demoAnswers[String(i)] = {
      questionId: String(i),
      selectedAnswer: (['A', 'B', 'C', 'D'] as const)[(i - 1) % 4],
      answeredAt: new Date().toISOString(),
    };
  }
  // 3 questions flagged as Not Sure
  demoFlags['5'] = true;
  demoFlags['18'] = true;
  demoFlags['42'] = true;

  useEffect(() => {
    // Screen specific state configuration
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('tcc.student.participation', 'demo-token-123');
      window.localStorage.setItem(
        'tcc.student.exam.progress',
        JSON.stringify({ sessionId: '1', attemptId: 'demo-token-123' })
      );
      window.localStorage.setItem('tcc.student.exam.passkey', 'ABCD-EFGH');
    }

    useStudentStore.getState().setScannedSession('1', '1');
    useStudentStore.getState().setExamPasskey('ABCD-EFGH');

    if (screen === 'passkey') {
      useStudentStore.getState().setSelectedStudent(null);
      useStudentStore.getState().setVerifiedStudent(null);
      useStudentStore.getState().setAgreedAt(null);
      useStudentStore.getState().setScannedSession('1', '1');
      useStudentStore.getState().setExamPasskey('ABCD-EFGH');
    } else if (screen === 'confirm') {
      // In confirm mode, student is selected but not yet verified, so it shows the candidate details form!
      useStudentStore.getState().setSelectedStudent(DEMO_STUDENT);
      useStudentStore.getState().setVerifiedStudent(null);
      useStudentStore.getState().setAgreedAt(null);
    } else if (screen === 'lobby') {
      useStudentStore.getState().setSelectedStudent(DEMO_STUDENT);
      useStudentStore.getState().setVerifiedStudent(DEMO_STUDENT);
      useStudentStore.getState().setAgreedAt(new Date().toISOString());
      useLobbyStore.getState().setSnapshot(DEMO_LOBBY_DATA as any);
    } else if (screen === 'rules' || screen === 'exam-start') {
      useStudentStore.getState().setSelectedStudent(DEMO_STUDENT);
      useStudentStore.getState().setVerifiedStudent(DEMO_STUDENT);
      useStudentStore.getState().setAgreedAt(null);
    } else {
      useStudentStore.getState().setSelectedStudent(DEMO_STUDENT);
      useStudentStore.getState().setVerifiedStudent(DEMO_STUDENT);
      useStudentStore.getState().setAgreedAt(new Date().toISOString());
      useLobbyStore.getState().setSnapshot(DEMO_LOBBY_DATA as any);
    }

    useExamStore.getState().setQuestions(OFFICIAL_100_QUESTIONS);
    useExamStore.getState().setSessionId('1');
    useExamStore.getState().setCurrentIndex(0); // Question 1
    useExamStore.getState().setRemainingSeconds(3540); // 59m remaining of 60m
    useExamStore.getState().setNavMode('scroll'); // Continuous vertical scroll down
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('tcc.settings.exam.nav_mode', 'scroll');
    }

    // Restore answers and flags into store with scroll navigation mode
    useExamStore.getState().restoreProgress({
      answers: demoAnswers,
      flags: demoFlags,
      navMode: 'scroll',
      remainingSeconds: 3540,
      totalDurationSeconds: 3600,
      currentIndex: 0,
    });

    setReady(true);
  }, [screen]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FAF7F2', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#7A1F2B', fontWeight: '700' }}>Loading TCC Examination Screen…</Text>
      </View>
    );
  }

  // 1. Android Wi-Fi Settings Screen
  if (screen === 'wifi') {
    return <AndroidWifiSettingsScreen />;
  }

  // 2. Landing / Home Screen
  if (screen === 'landing') {
    return <HomeScreen />;
  }

  // 3. Home Screen (Open App CTA - with highlight on Take Examination)
  if (screen === 'home') {
    return (
      <View style={{ flex: 1 }}>
        <HomeScreen />
        <View
          style={{
            position: 'absolute',
            bottom: 26,
            right: 18,
            width: 184,
            height: 52,
            borderRadius: 26,
            borderWidth: 2.5,
            borderColor: '#EA580C',
            backgroundColor: 'rgba(234, 88, 12, 0.18)',
            pointerEvents: 'none',
          }}
        />
      </View>
    );
  }

  // 4. QR Scanner View
  if (screen === 'scan') {
    return <JoinExaminationScreen />;
  }

  // 5. Manual Room Code View
  if (screen === 'code') {
    return <JoinExaminationScreen />;
  }

  // 6. Examination Passkey Screen
  if (screen === 'passkey') {
    return <StudentPasskeyScreen />;
  }

  // 7. Identity Confirmation Screen
  if (screen === 'confirm') {
    return <StudentConfirmationScreen />;
  }

  // 8. Student Waiting Lobby Screen
  if (screen === 'lobby') {
    return <StudentLobbyScreen />;
  }

  // 9. Terms & Agreement (Start Examination) Screen
  if (screen === 'rules' || screen === 'exam-start') {
    return <StudentConfirmationScreen />;
  }

  // 10. Actual Question Screen
  if (screen === 'question') {
    return <ExamScreen />;
  }

  // 11. Question Status Navigator Sheet (100 Questions)
  if (screen === 'navigator') {
    return (
      <ThemeProvider>
        <View style={{ flex: 1, backgroundColor: '#FAF7F2' }}>
          <ExamScreen />
          <QuestionNavigatorSheet
            visible={true}
            onClose={() => {}}
            questions={OFFICIAL_100_QUESTIONS}
            answers={demoAnswers}
            flags={demoFlags}
            currentIndex={0}
            onJumpToQuestion={() => {}}
          />
        </View>
      </ThemeProvider>
    );
  }

  // 12. Submit Confirmation Dialog
  if (screen === 'submit') {
    return (
      <ThemeProvider>
        <View style={{ flex: 1, backgroundColor: '#FAF7F2' }}>
          <ExamScreen />
          <SubmitConfirmDialog
            visible={true}
            answeredCount={98}
            unansweredCount={2}
            flaggedCount={3}
            totalQuestions={100}
            onReview={() => {}}
            onSubmit={() => {}}
            onClose={() => {}}
          />
        </View>
      </ThemeProvider>
    );
  }

  // 13. Examination Successfully Submitted / Completed Screen
  if (screen === 'completed') {
    return <CompletedScreen />;
  }

  // Default to Landing
  return <HomeScreen />;
}
