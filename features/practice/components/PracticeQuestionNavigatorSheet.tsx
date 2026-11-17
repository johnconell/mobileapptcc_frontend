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
import { ArrowUp, Sparkles, X } from 'lucide-react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { PracticePointerArrow } from './PracticePointerArrow';
import type { ExamAnswer, Question } from '@/shared/types';
import { isQuestionAnswered } from '@/features/examinations/utils/questionNavigation';

export interface PracticeQuestionNavigatorSheetProps {
  visible: boolean;
  onClose: () => void;
  questions: Question[];
  answers: Record<string, ExamAnswer>;
  flags: Record<string, boolean>;
  currentIndex: number;
  onJumpToQuestion: (index: number) => void;
  highlightQuestionNumber?: number;
  isTutorialStep?: boolean;
  onSkipTutorial?: () => void;
}

function categoryKeyOf(question: Question): string {
  return (question.category || question.subjectId || 'General').trim() || 'General';
}

function Legend({
  color,
  borderColor,
  borderWidth,
  dotColor,
  label,
  textColor,
}: {
  color: string;
  borderColor?: string;
  borderWidth?: number;
  dotColor?: string;
  label: string;
  textColor: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendBox,
          {
            backgroundColor: color,
            borderColor: borderColor ?? color,
            borderWidth: borderWidth ?? 1,
          },
        ]}
      >
        {dotColor && <View style={[styles.legendDot, { backgroundColor: dotColor }]} />}
      </View>
      <Text numberOfLines={1} style={[styles.legendLabel, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
}

function PracticeQuestionNavigatorSheetComponent({
  visible,
  onClose,
  questions,
  answers,
  flags,
  currentIndex,
  onJumpToQuestion,
  highlightQuestionNumber,
  isTutorialStep = false,
  onSkipTutorial,
}: PracticeQuestionNavigatorSheetProps) {
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
              maxHeight: Math.min(windowHeight * 0.90, 780),
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

          {/* Interactive Tutorial Callout when guiding examinee to Question 5 */}
          {isTutorialStep && (
            <View style={[styles.tutorialCard, { backgroundColor: isDark ? '#2D2310' : '#FEF3C7', borderColor: '#F59E0B' }]}>
              <View style={styles.tutorialBadgeRow}>
                <View style={[styles.tutorialBadge, { backgroundColor: '#F59E0B22' }]}>
                  <Sparkles size={13} color="#D97706" />
                  <Text style={styles.tutorialBadgeText}>Tutorial · Question Jumping</Text>
                </View>
                {onSkipTutorial && (
                  <Pressable onPress={onSkipTutorial} hitSlop={10}>
                    <Text style={[styles.skipTutorialText, { color: theme.textSecondary }]}>Skip</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[styles.tutorialHeadline, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                Tap Question 5 to Jump
              </Text>
              <Text style={[styles.tutorialSubline, { color: isDark ? '#FCD34D' : '#78350F' }]}>
                Notice button <Text style={{ fontWeight: '700' }}>5</Text> highlighted with the gold arrow below! You can tap ANY number at any time to jump straight to that question.
              </Text>
            </View>
          )}

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
          >
            {categoriesData.map((category) => {
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

                          const isHighlightedQ5 = highlightQuestionNumber === number;

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

                          if (isHighlightedQ5) {
                            borderColor = '#F59E0B';
                          }

                          return (
                            <View key={question.id} style={styles.buttonWrapper}>
                              <Pressable
                                onPress={() => handleSelectQuestion(index)}
                                accessibilityRole="button"
                                accessibilityLabel={`Question ${number}${flagged ? ', marked as not sure' : ''}${answered ? ', answered' : ', unanswered'}${current ? ', current question' : ''}`}
                                style={[
                                  styles.gridButton,
                                  {
                                    backgroundColor,
                                    borderColor,
                                    borderWidth: isHighlightedQ5 ? 3 : current ? 2.5 : 1,
                                  },
                                  isHighlightedQ5 && styles.highlightedRing,
                                ]}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.gridButtonText,
                                    {
                                      color: isHighlightedQ5 ? (isDark ? '#FDE68A' : '#B45309') : textColor,
                                      fontWeight: isHighlightedQ5 || current ? '700' : '600',
                                    },
                                  ]}
                                >
                                  {number}
                                </Text>

                                {flagged && (
                                  <View
                                    style={[
                                      styles.flagBadge,
                                      { backgroundColor: theme.notSure.dot },
                                    ]}
                                  />
                                )}

                                {flagged && answered && (
                                  <View
                                    style={[
                                      styles.answeredPip,
                                      { backgroundColor: theme.accent },
                                    ]}
                                  />
                                )}
                              </Pressable>

                              {/* Prominent Animated Pointer Arrow Pointing Up into Button 5 */}
                              {isHighlightedQ5 && (
                                <View style={styles.pointerContainer} pointerEvents="none">
                                  <PracticePointerArrow
                                    direction="up"
                                    label="TAP 5"
                                  />
                                </View>
                              )}
                            </View>
                          );
                        })}

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
      </View>
    </Modal>
  );
}

export const PracticeQuestionNavigatorSheet = memo(PracticeQuestionNavigatorSheetComponent);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: 8,
    paddingBottom: 28,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  tutorialBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tutorialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tutorialBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  skipTutorialText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tutorialHeadline: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  tutorialSubline: {
    fontSize: 12,
    lineHeight: 17,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  gridScroll: {
    paddingHorizontal: 16,
  },
  gridContent: {
    paddingTop: 4,
    paddingBottom: 24,
    gap: 16,
  },
  categoryBlock: {
    gap: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 4,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoryCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  categoryGrid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  buttonWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  gridButton: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  highlightedRing: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  gridButtonText: {
    fontSize: 14,
  },
  flagBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  answeredPip: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pointerContainer: {
    marginTop: 4,
    alignItems: 'center',
    gap: 2,
  },
  arrowUpIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointerPill: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pointerPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  gridPlaceholder: {
    flex: 1,
    aspectRatio: 1,
  },
});
