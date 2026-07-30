import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CloudUpload } from 'lucide-react-native';
import {
  ConfirmationModal,
  CountdownTimer,
  ExamBottomNavigation,
  Header,
  ProgressBar,
  QuestionCard,
} from '@/components/ui';
import { useExamStore, useSettingsStore } from '@/stores';
import { useExamTimer } from '@/hooks/useExamTimer';
import { DeviceService } from '@/services/DeviceService';
import { colors } from '@/theme';
import type { ChoiceKey } from '@/types';

export default function ExamScreen() {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const questions = useExamStore((s) => s.questions);
  const currentIndex = useExamStore((s) => s.currentIndex);
  const answers = useExamStore((s) => s.answers);
  const autoSavedAt = useExamStore((s) => s.autoSavedAt);
  const setCurrentIndex = useExamStore((s) => s.setCurrentIndex);
  const selectAnswer = useExamStore((s) => s.selectAnswer);
  const unansweredCount = useExamStore((s) => s.unansweredCount);
  const answeredCount = useExamStore((s) => s.answeredCount);
  const keepAwake = useSettingsStore((s) => s.keepAwakeDuringExam);
  const remainingSeconds = useExamTimer(questions.length > 0);

  useEffect(() => {
    if (!questions.length) router.replace('/');
  }, [questions.length, router]);

  useEffect(() => {
    if (keepAwake) void DeviceService.enableExamKeepAwake();
    return () => DeviceService.disableExamKeepAwake();
  }, [keepAwake]);

  useEffect(() => {
    if (remainingSeconds === 0 && questions.length > 0) {
      router.replace('/(student)/submitting');
    }
  }, [remainingSeconds, questions.length, router]);

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
        subtitle="Entrance Examination"
        right={<CountdownTimer remainingSeconds={remainingSeconds} compact />}
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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <QuestionCard
          question={question}
          selectedAnswer={selected}
          onSelect={(choice: ChoiceKey) => selectAnswer(question.id, choice)}
        />
      </ScrollView>

      <ExamBottomNavigation
        onPrevious={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
        onNext={() => setCurrentIndex(Math.min(questions.length - 1, currentIndex + 1))}
        onPalette={() => setPaletteOpen(true)}
        onSubmit={() => setConfirmOpen(true)}
        canPrevious={currentIndex > 0}
        canNext={currentIndex < questions.length - 1}
        remainingUnanswered={unansweredCount()}
      />

      <Modal visible={paletteOpen} animationType="slide" transparent onRequestClose={() => setPaletteOpen(false)}>
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
        title="Submit examination?"
        description={`You have ${unansweredCount()} unanswered question(s). Once submitted, you cannot change your answers.`}
        confirmLabel="Submit"
        cancelLabel="Review"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          router.replace('/(student)/submitting');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
