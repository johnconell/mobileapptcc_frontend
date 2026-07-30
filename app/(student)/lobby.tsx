import React, { useEffect } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Header, Card, Loader, StatusChip } from '@/components/ui';
import { LobbyWaitingAnimation } from '@/features/lobby/LobbyWaitingAnimation';
import { useLobby } from '@/hooks/useRepositories';
import { QuestionRepository } from '@/repositories';
import { useExamStore, useLobbyStore, useStudentStore } from '@/stores';
import { colors } from '@/theme';

export default function StudentLobbyScreen() {
  const router = useRouter();
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const setSnapshot = useLobbyStore((s) => s.setSnapshot);
  const setQuestions = useExamStore((s) => s.setQuestions);
  const setSessionId = useExamStore((s) => s.setSessionId);
  const startExam = useExamStore((s) => s.startExam);

  const lobbyQuery = useLobby(scannedSessionId ?? undefined);

  useEffect(() => {
    if (!scannedSessionId || !verifiedStudent) {
      router.replace('/');
    }
  }, [scannedSessionId, verifiedStudent, router]);

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

  if (!lobbyQuery.data || !verifiedStudent) {
    return <Loader fullscreen label="Joining waiting lobby…" />;
  }

  const { schedule, session } = lobbyQuery.data;

  return (
    <View style={styles.screen}>
      <Header
        title="Waiting Lobby"
        subtitle="Waiting for Proctor..."
        onBack={() => router.replace('/')}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LobbyWaitingAnimation />
        <Animated.View entering={FadeInDown.springify()} style={styles.center}>
          <StatusChip status="waiting" />
          <Text style={styles.title}>Waiting for Proctor...</Text>
          <Text style={styles.sub}>
            Stay on this screen. You will enter the examination automatically when the proctor starts.
          </Text>
        </Animated.View>

        <Card delay={100}>
          <Text style={styles.label}>Student</Text>
          <Text style={styles.value}>{verifiedStudent.fullName}</Text>
          <Text style={styles.line}>Examination: {schedule.name}</Text>
          <Text style={styles.line}>Date: {schedule.examinationDate}</Text>
          <Text style={styles.line}>Time: {session.timeLabel}</Text>
          <Text style={styles.line}>Batch: {session.batchNumber}</Text>
          <Text style={styles.line}>Venue: {session.venue}</Text>
        </Card>
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
});
