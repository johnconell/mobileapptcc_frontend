import React, { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Header, Card, SkeletonDetail, StatusChip, Button } from '@/components/ui';
import { LobbyWaitingAnimation } from '@/features/lobby/LobbyWaitingAnimation';
import { useLobby } from '@/hooks/useRepositories';
import { QuestionRepository, StudentRepository } from '@/repositories';
import { useExamStore, useLobbyStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

const LOBBY_RULES = [
  'Do not take screenshots or record the screen.',
  'Do not switch apps or leave the examination screen.',
  'Do not copy or share questions with anyone.',
  'Do not use AI tools, notes, or other devices.',
  'Stay on campus exam Wi‑Fi for the entire exam.',
];

export default function StudentLobbyScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);
  const setVerifiedStudent = useStudentStore((s) => s.setVerifiedStudent);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const setQuestions = useExamStore((s) => s.setQuestions);
  const setSessionId = useExamStore((s) => s.setSessionId);
  const startExam = useExamStore((s) => s.startExam);
  const [cancelling, setCancelling] = useState(false);

  const lobbyQuery = useLobby(scannedSessionId ?? undefined);

  useEffect(() => {
    if (!scannedSessionId || !verifiedStudent) {
      router.replace('/');
    }
  }, [scannedSessionId, verifiedStudent, router]);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
      headerShown: false,
    });

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const actionType = event.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') {
        return;
      }
      event.preventDefault();
    });

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      unsubscribe();
      backSub.remove();
    };
  }, [navigation]);

  useEffect(() => {
    if (lobbyQuery.data) {
      setSnapshot(lobbyQuery.data);
    }
  }, [lobbyQuery.data, setSnapshot]);

  useEffect(() => {
    async function enterExam() {
      if (!lobbyQuery.data || lobbyQuery.data.status !== 'in_progress' || !scannedSessionId) {
        return;
      }
      const questions = await QuestionRepository.getQuestions(scannedSessionId);
      setSessionId(scannedSessionId);
      setQuestions(questions);
      startExam(lobbyQuery.data.session.durationMinutes);
      router.replace('/(student)/exam');
    }
    void enterExam();
  }, [
    lobbyQuery.data,
    scannedSessionId,
    setQuestions,
    setSessionId,
    startExam,
    router,
  ]);

  const cancelRegistration = useCallback(() => {
    if (!verifiedStudent || cancelling) return;
    Alert.alert(
      'Cancel registration?',
      'This clears your check-in so you can enter your examination key again. The proctor will see you leave the lobby.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Cancel registration',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCancelling(true);
              try {
                await StudentRepository.cancelRegistration(verifiedStudent.id);
                setVerifiedStudent(null);
                setSelectedStudent(null);
                setSnapshot(null);
                router.replace('/(student)/passkey');
              } catch (error) {
                Alert.alert(
                  'Unable to cancel',
                  error instanceof Error
                    ? error.message
                    : 'Try again, or ask the proctor for help.',
                );
              } finally {
                setCancelling(false);
              }
            })();
          },
        },
      ],
    );
  }, [
    verifiedStudent,
    cancelling,
    setVerifiedStudent,
    setSelectedStudent,
    setSnapshot,
    router,
  ]);

  if (!lobbyQuery.data || !verifiedStudent) {
    return (
      <View style={styles.screen}>
        <Header title="Waiting Lobby" subtitle="Joining…" onBack={undefined} />
        <SkeletonDetail />
      </View>
    );
  }

  const { schedule, session } = lobbyQuery.data;

  return (
    <View style={styles.screen}>
      <Header
        title="Waiting Lobby"
        subtitle="Waiting for Proctor..."
        onBack={undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LobbyWaitingAnimation />
        <Animated.View entering={FadeInDown.springify()} style={styles.center}>
          <StatusChip status="waiting" />
          <Text style={styles.title}>Waiting for Proctor...</Text>
          <Text style={styles.sub}>
            Stay on this screen. You will enter the examination automatically when the proctor
            starts.
          </Text>
        </Animated.View>

        <Card delay={100}>
          <Text style={styles.label}>Student</Text>
          <Text style={styles.value}>{verifiedStudent.fullName}</Text>
          <Text style={styles.line}>Gmail: {verifiedStudent.email || '—'}</Text>
          <Text style={styles.line}>Program: {verifiedStudent.programName || '—'}</Text>
          <Text style={styles.line}>Examination: {schedule.name}</Text>
          <Text style={styles.line}>Date: {schedule.examinationDate}</Text>
          <Text style={styles.line}>Time: {session.timeLabel}</Text>
          <Text style={styles.line}>Batch: {session.batchNumber}</Text>
          <Text style={styles.line}>Venue: {session.venue}</Text>
        </Card>

        <Card delay={140}>
          <Text style={styles.label}>Examination rules</Text>
          <Text style={styles.rulesIntro}>
            By waiting here you acknowledge these rules. Violations are reported to the proctor.
          </Text>
          {LOBBY_RULES.map((rule) => (
            <View key={rule} style={styles.ruleRow}>
              <Check size={16} color={colors.success} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </Card>

        <Button
          title="Cancel Registration"
          variant="outline"
          fullWidth
          loading={cancelling}
          onPress={cancelRegistration}
        />
        <Text style={styles.cancelHint}>
          Wrong key or identity? Cancel to return and enter your examination key again.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  center: { alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  sub: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  value: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  line: { fontSize: 14, color: colors.inkSecondary, marginBottom: 6, fontWeight: '500' },
  rulesIntro: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSecondary,
    marginBottom: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  ruleText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    fontWeight: '500',
  },
  cancelHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: -4,
  },
});
