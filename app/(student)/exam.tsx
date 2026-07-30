import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { CloudUpload, Shield } from 'lucide-react-native';
import {
  ConfirmationModal,
  CountdownTimer,
  ExamBottomNavigation,
  Header,
  ProgressBar,
  QuestionCard,
} from '@/components/ui';
import { ExamSecurityOverlay } from '@/features/exam/ExamSecurityOverlay';
import { useExamStore, useStudentStore } from '@/stores';
import { useExamTimer } from '@/hooks/useExamTimer';
import { useExamSecurity } from '@/hooks/useExamSecurity';
import { LobbyRepository } from '@/repositories';
import { colors } from '@/theme';
import type { ChoiceKey } from '@/types';

export default function ExamScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const questions = useExamStore((s) => s.questions);
  const currentIndex = useExamStore((s) => s.currentIndex);
  const answers = useExamStore((s) => s.answers);
  const autoSavedAt = useExamStore((s) => s.autoSavedAt);
  const sessionId = useExamStore((s) => s.sessionId);
  const setCurrentIndex = useExamStore((s) => s.setCurrentIndex);
  const selectAnswer = useExamStore((s) => s.selectAnswer);
  const unansweredCount = useExamStore((s) => s.unansweredCount);
  const answeredCount = useExamStore((s) => s.answeredCount);
  const setPaused = useExamStore((s) => s.setPaused);
  const markSubmitted = useExamStore((s) => s.markSubmitted);

  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);

  const securityEnabled = questions.length > 0;

  const goSubmit = useCallback(
    (reason: 'submitted' | 'policy_violation' | 'time_expired' = 'submitted') => {
      markSubmitted(reason);
      router.replace('/(student)/submitting');
    },
    [markSubmitted, router],
  );

  const onMaxViolations = useCallback(() => {
    if (verifiedStudent?.id) {
      void LobbyRepository.finishStudent(verifiedStudent.id, 'policy_violation');
    }
    goSubmit('policy_violation');
  }, [verifiedStudent?.id, goSubmit]);

  const openSubmitConfirm = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const {
    paused,
    warningVisible,
    warningMessage,
    violationCount,
    maxViolations,
    acknowledgeWarning,
    requestSubmitFromWarning,
  } = useExamSecurity({
    enabled: securityEnabled,
    sessionId,
    studentId: verifiedStudent?.id ?? null,
    studentName: verifiedStudent?.fullName ?? null,
    onMaxViolations,
    onRequestSubmit: openSubmitConfirm,
  });

  useEffect(() => {
    setPaused(paused);
  }, [paused, setPaused]);

  // Lock navigation while exam is active — no gesture / hardware back escape.
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      fullScreenGestureEnabled: false,
      headerShown: false,
    });

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      // Allow only programmatic replace to submitting/completed after submit.
      const actionType = event.data.action.type;
      if (actionType === 'REPLACE' || actionType === 'RESET') {
        return;
      }
      event.preventDefault();
    });

    return unsubscribe;
  }, [navigation]);

  const remainingSeconds = useExamTimer(questions.length > 0 && !paused);

  useEffect(() => {
    if (!questions.length) router.replace('/');
  }, [questions.length, router]);

  useEffect(() => {
    if (remainingSeconds === 0 && questions.length > 0 && !paused) {
      goSubmit('time_expired');
    }
  }, [remainingSeconds, questions.length, paused, goSubmit]);

  const question = questions[currentIndex];
  const progress = questions.length ? answeredCount() / questions.length : 0;
  const selected = question ? answers[question.id]?.selectedAnswer ?? null : null;

  const paletteItems = useMemo(
    () =>
      questions.map((q, index) => ({
        index,
        number: q.number,
        answered: Boolean(answers[q.id]?.selectedAnswer),
        current: index === currentIndex,
      })),
    [answers, currentIndex, questions],
  );

  if (!question) return null;

  return (
    <View style={styles.screen}>
      <Header
        title={`Question ${question.number} of ${questions.length}`}
        subtitle="Secure Examination Mode"
        hideBackSlot
        right={
          <View style={styles.headerRight}>
            <View style={styles.secureBadge}>
              <Shield size={12} color={colors.primary} />
              <Text style={styles.secureText}>
                {violationCount}/{maxViolations}
              </Text>
            </View>
            <CountdownTimer remainingSeconds={remainingSeconds} compact />
          </View>
        }
      />

      <View style={styles.progressWrap}>
        <ProgressBar progress={progress} />
        <View style={styles.saveRow}>
          <CloudUpload size={14} color={colors.success} />
          <Text style={styles.saveText}>
            {autoSavedAt
              ? `Auto-saved · ${new Date(autoSavedAt).toLocaleTimeString()}`
              : 'Answers auto-save as you select'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!paused}
      >
        <QuestionCard
          question={question}
          selectedAnswer={selected}
          secure
          onSelect={(choice: ChoiceKey) => {
            if (paused) return;
            selectAnswer(question.id, choice);
            if (verifiedStudent?.id) {
              void LobbyRepository.touchActivity(verifiedStudent.id);
            }
          }}
        />
      </ScrollView>

      <ExamBottomNavigation
        onPrevious={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
        onNext={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
        onPalette={() => setPaletteOpen(true)}
        onSubmit={openSubmitConfirm}
        canPrevious={!paused && currentIndex > 0}
        canNext={!paused && currentIndex < questions.length - 1}
        remainingUnanswered={unansweredCount()}
      />

      <Modal
        visible={paletteOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPaletteOpen(false)}
      >
        <View style={styles.paletteOverlay}>
          <View style={styles.paletteSheet}>
            <Text style={styles.paletteTitle}>Question Palette</Text>
            <View style={styles.paletteGrid}>
              {paletteItems.map((item) => (
                <Pressable
                  key={item.number}
                  onPress={() => {
                    setCurrentIndex(item.index);
                    setPaletteOpen(false);
                  }}
                  style={[
                    styles.paletteItem,
                    item.answered && styles.paletteAnswered,
                    item.current && styles.paletteCurrent,
                  ]}
                >
                  <Text
                    style={[
                      styles.paletteItemText,
                      item.answered && !item.current && styles.paletteItemTextAnswered,
                      item.current && styles.paletteItemTextActive,
                    ]}
                  >
                    {item.number}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setPaletteOpen(false)} style={styles.closePalette}>
              <Text style={styles.closePaletteText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={confirmOpen}
        title="Submit Examination?"
        description={`You have ${unansweredCount()} unanswered question(s). Once submitted, Secure Examination Mode will end.`}
        confirmLabel="Submit Examination"
        cancelLabel="Continue Examination"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          goSubmit('submitted');
        }}
      />

      <ExamSecurityOverlay
        visible={warningVisible}
        violationCount={violationCount}
        maxViolations={maxViolations}
        message={warningMessage}
        onContinue={acknowledgeWarning}
        onSubmit={requestSubmitFromWarning}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0D9DC',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  secureText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  progressWrap: { paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveText: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  content: { padding: 20, paddingBottom: 24 },
  paletteOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  paletteSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '75%',
  },
  paletteTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 16 },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paletteItem: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paletteAnswered: { backgroundColor: '#F0D9DC', borderColor: colors.primary },
  paletteCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  paletteItemText: { fontWeight: '700', color: colors.inkSecondary },
  paletteItemTextAnswered: { color: colors.primary },
  paletteItemTextActive: { color: colors.white },
  closePalette: { marginTop: 18, alignItems: 'center', paddingVertical: 12 },
  closePaletteText: { fontWeight: '700', color: colors.primary },
});
