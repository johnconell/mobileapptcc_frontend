import React, { memo, useCallback, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import type { ExamAnswer, Question } from '@/shared/types';
import { isQuestionAnswered } from '@/features/examinations/utils/questionNavigation';

export interface QuestionNavigatorSheetProps {
  visible: boolean;
  onClose: () => void;
  questions: Question[];
  answers: Record<string, ExamAnswer>;
  flags: Record<string, boolean>;
  currentIndex: number;
  onJumpToQuestion: (index: number) => void;
}

function categoryKeyOf(question: Question): string {
  return (question.category || question.subjectId || 'General').trim() || 'General';
}

function QuestionNavigatorSheetComponent({
  visible,
  onClose,
  questions,
  answers,
  flags,
  currentIndex,
  onJumpToQuestion,
}: QuestionNavigatorSheetProps) {
  const { theme, isDark } = useThemeTokens();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const categoriesData = useMemo(() => {
    const map = new Map<string, Array<{ question: Question; index: number }>>();
    questions.forEach((question, index) => {
      const name = categoryKeyOf(question);
      const items = map.get(name) ?? [];
      items.push({ question, index });
      map.set(name, items);
    });
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [questions]);

  const handleSelectQuestion = useCallback(
    (index: number) => {
      onJumpToQuestion(index);
      onClose();
    },
    [onJumpToQuestion, onClose],
  );

  // Size each cell from the actual sheet content width. Explicit column/row
  // gaps avoid flex-wrap distributing a fifth cell onto a visually uneven row.
  const horizontalPadding = 32;
  const gap = 6;
  const numColumns = 5;
  const itemWidth = Math.floor(
    (windowWidth - horizontalPadding - gap * (numColumns - 1)) / numColumns,
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: `${isDark ? theme.bg : theme.text}73` }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close jump to question sheet"
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              maxHeight: Math.min(windowHeight * 0.9, 760),
            },
          ]}
        >
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />

          <View style={styles.titleRow}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Jump to Question</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              style={[styles.closeBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
            >
              <X size={18} color={theme.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.legendRow} accessibilityLabel="Question status legend">
            <Legend color={theme.accent} label="Answered" textColor={theme.text} />
            <Legend
              color={theme.notSure.bg}
              borderColor={theme.notSure.border}
              label="Not Sure"
              textColor={theme.text}
            />
            <Legend
              color={theme.surface}
              borderColor={theme.border}
              label="Unanswered"
              textColor={theme.text}
            />
            <Legend
              color={theme.surface}
              borderColor={theme.ring}
              label="Current"
              textColor={theme.text}
            />
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator
          >
            {categoriesData.map((category) => (
              <View key={category.name} style={styles.categoryBlock}>
                <Text style={[styles.categoryTitle, { color: theme.text }]}>{category.name}</Text>
                <View style={styles.gridContainer}>
                  {category.items.map(({ question, index }) => {
                    const answered = isQuestionAnswered(answers[question.id]);
                    const flagged = Boolean(flags[question.id]);
                    const current = index === currentIndex;
                    const number = Number.isFinite(question.number) ? question.number : index + 1;

                    let backgroundColor = theme.surface;
                    let borderColor = theme.border;
                    let textColor = theme.text;
                    if (flagged) {
                      backgroundColor = theme.notSure.bg;
                      borderColor = theme.notSure.border;
                      textColor = theme.notSure.text;
                    } else if (answered) {
                      backgroundColor = theme.accent;
                      borderColor = theme.accent;
                      textColor = theme.onAccent;
                    }
                    if (current) borderColor = theme.ring;

                    return (
                      <Pressable
                        key={question.id}
                        onPress={() => handleSelectQuestion(index)}
                        accessibilityRole="button"
                        accessibilityLabel={`Question ${number}${flagged ? ', marked as not sure' : answered ? ', answered' : ', unanswered'}${current ? ', current question' : ''}`}
                        style={[
                          styles.gridButton,
                          {
                            width: itemWidth,
                            backgroundColor,
                            borderColor,
                            borderWidth: current ? 2 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.gridButtonText, { color: textColor }]}>{number}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Legend({
  color,
  borderColor,
  label,
  textColor,
}: {
  color: string;
  borderColor?: string;
  label: string;
  textColor: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSquare, { backgroundColor: color, borderColor: borderColor ?? color }]} />
      <Text style={[styles.legendLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export const QuestionNavigatorSheet = memo(QuestionNavigatorSheetComponent);

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  dragHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 18, fontWeight: '600' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSquare: { width: 12, height: 12, borderRadius: 2, borderWidth: 1 },
  legendLabel: { fontSize: 12, fontWeight: '500' },
  gridScroll: { flexGrow: 0 },
  gridContent: { paddingBottom: 8 },
  categoryBlock: { marginBottom: 16 },
  categoryTitle: { fontSize: 15, fontWeight: '600', marginBottom: 9 },
  gridContainer: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 6,
    rowGap: 8,
    alignItems: 'flex-start',
  },
  gridButton: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridButtonText: { fontSize: 14, fontWeight: '600' },
});
