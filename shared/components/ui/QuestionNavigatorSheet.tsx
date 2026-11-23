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
  tutorialQuestionNumber?: number;
  tutorialQuestionRef?: React.Ref<View>;
  tutorialOverlay?: React.ReactNode;
  tutorialOnScroll?: () => void;
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
  tutorialQuestionNumber,
  tutorialQuestionRef,
  tutorialOverlay,
  tutorialOnScroll,
}: QuestionNavigatorSheetProps) {
  const { theme, isDark } = useThemeTokens();
  const { height: windowHeight } = useWindowDimensions();

  const categoriesData = useMemo(() => {
    const map = new Map<string, Array<{ question: Question; index: number }>>();
    questions.forEach((question, index) => {
      const name = categoryKeyOf(question);
      const items = map.get(name) ?? [];
      items.push({ question, index });
      map.set(name, items);
    });
    return Array.from(map.entries()).map(([name, items]) => {
      const answeredCount = items.filter(({ question }) =>
        isQuestionAnswered(answers[question.id]),
      ).length;
      return { name, items, answeredCount };
    });
  }, [questions, answers]);

  const handleSelectQuestion = useCallback(
    (index: number) => {
      onJumpToQuestion(index);
      onClose();
    },
    [onJumpToQuestion, onClose],
  );

  const currentHighlightColor = isDark ? '#60A5FA' : '#0284C7';

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
              backgroundColor: isDark ? '#222730' : theme.surface,
              borderColor: theme.border,
              maxHeight: Math.min(windowHeight * 0.88, 760),
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
              dotColor={theme.notSure.dot}
              label="Not Sure"
              textColor={theme.text}
            />
            <Legend
              color={isDark ? theme.surfaceAlt : '#EDEEF4'}
              borderColor={theme.border}
              label="Unanswered"
              textColor={theme.text}
            />
            <Legend
              color={theme.surface}
              borderColor={currentHighlightColor}
              label="Current"
              textColor={theme.text}
              borderWidth={2.5}
            />
          </View>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator
            onMomentumScrollEnd={tutorialOnScroll}
            onScrollEndDrag={tutorialOnScroll}
          >
            {categoriesData.map((category) => {
              // Chunk items into exact rows of 5 buttons each
              const rows: Array<Array<{ question: Question; index: number }>> = [];
              for (let i = 0; i < category.items.length; i += 5) {
                rows.push(category.items.slice(i, i + 5));
              }

              return (
                <View key={category.name} style={styles.categoryBlock}>
                  <View style={styles.categoryHeader}>
                    <Text style={[styles.categoryTitle, { color: theme.text }]}>
                      {category.name}
                    </Text>
                    <Text style={[styles.categoryCount, { color: theme.textSecondary }]}>
                      ({category.answeredCount}/{category.items.length})
                    </Text>
                  </View>

                  <View style={styles.categoryGrid}>
                    {rows.map((rowItems, rowIndex) => (
                      <View key={rowIndex} style={styles.gridRow}>
                        {rowItems.map(({ question, index }) => {
                          const answered = isQuestionAnswered(answers[question.id]);
                          const flagged = Boolean(flags[question.id]);
                          const current = index === currentIndex;
                          const number = Number.isFinite(question.number)
                            ? question.number
                            : index + 1;

                          let backgroundColor = isDark ? theme.surfaceAlt : '#EDEEF4';
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

                          if (current) {
                            borderColor = currentHighlightColor;
                          }

                          return (
                            <Pressable
                              key={question.id}
                              testID={number === tutorialQuestionNumber ? 'tutorial-question-5' : undefined}
                              ref={number === tutorialQuestionNumber ? tutorialQuestionRef : undefined}
                              onPress={() => handleSelectQuestion(index)}
                              accessibilityRole="button"
                              accessibilityLabel={`Question ${number}${flagged ? ', marked as not sure' : ''}${answered ? ', answered' : ', unanswered'}${current ? ', current question' : ''}`}
                              style={[
                                styles.gridButton,
                                {
                                  backgroundColor,
                                  borderColor,
                                  borderWidth: current ? 2.5 : 1,
                                },
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.gridButtonText,
                                  {
                                    color: textColor,
                                    fontWeight: current ? '700' : '600',
                                  },
                                ]}
                              >
                                {number}
                              </Text>

                              {/* Flagged / Not Sure dot indicator at top-right */}
                              {flagged && (
                                <View
                                  style={[
                                    styles.flagBadge,
                                    { backgroundColor: theme.notSure.dot },
                                  ]}
                                />
                              )}

                              {/* If both answered and flagged, show blue answered pip indicator */}
                              {flagged && answered && (
                                <View
                                  style={[
                                    styles.answeredPip,
                                    { backgroundColor: theme.accent },
                                  ]}
                                />
                              )}
                            </Pressable>
                          );
                        })}

                        {/* Fill trailing empty slots in partial row to keep equal sizing */}
                        {Array.from({ length: 5 - rowItems.length }).map((_, placeholderIdx) => (
                          <View
                            key={`placeholder-${placeholderIdx}`}
                            style={styles.gridPlaceholder}
                          />
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
        {tutorialOverlay}
      </View>
    </Modal>
  );
}

function Legend({
  color,
  borderColor,
  dotColor,
  label,
  textColor,
  borderWidth = 1,
}: {
  color: string;
  borderColor?: string;
  dotColor?: string;
  label: string;
  textColor: string;
  borderWidth?: number;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSquare,
          {
            backgroundColor: color,
            borderColor: borderColor ?? color,
            borderWidth,
          },
        ]}
      >
        {dotColor && <View style={[styles.legendDot, { backgroundColor: dotColor }]} />}
      </View>
      <Text style={[styles.legendLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export const QuestionNavigatorSheet = memo(QuestionNavigatorSheetComponent);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  legendLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  gridScroll: {
    flexGrow: 0,
  },
  gridContent: {
    paddingBottom: 36,
  },
  categoryBlock: {
    marginBottom: 18,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  categoryCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryGrid: {
    width: '100%',
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginBottom: 8,
  },
  gridButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridButtonText: {
    fontSize: 14,
  },
  gridPlaceholder: {
    flex: 1,
    height: 44,
  },
  flagBadge: {
    position: 'absolute',
    top: 4,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  answeredPip: {
    position: 'absolute',
    bottom: 4,
    width: 12,
    height: 3,
    borderRadius: 1.5,
  },
});
