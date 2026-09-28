import React, { memo, useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, Flag, X } from 'lucide-react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { Row } from './primitives';
import type { ChoiceKey, ExamAnswer, Question } from '@/shared/types';

export interface QuestionNavigatorSheetProps {
  visible: boolean;
  onClose: () => void;
  questions: Question[];
  answers: Record<string, ExamAnswer>;
  flags: Record<string, boolean>;
  currentIndex: number;
  initialFilter?: QuestionNavigatorFilter;
  onJumpToQuestion: (index: number) => void;
}

export type QuestionNavigatorFilter = 'all' | 'not_sure' | 'unanswered' | 'review';

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
  initialFilter = 'all',
  onJumpToQuestion,
}: QuestionNavigatorSheetProps) {
  const { theme, isDark } = useThemeTokens();
  const { width: windowWidth } = useWindowDimensions();

  const [activeFilter, setActiveFilter] = useState<QuestionNavigatorFilter>('all');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  useLayoutEffect(() => {
    if (visible) setActiveFilter(initialFilter);
  }, [visible, initialFilter]);

  // Group questions by category
  const categoriesData = useMemo(() => {
    const map = new Map<string, Array<{ question: Question; index: number }>>();
    questions.forEach((q, idx) => {
      const cat = categoryKeyOf(q);
      const list = map.get(cat) ?? [];
      list.push({ question: q, index: idx });
      map.set(cat, list);
    });

    return Array.from(map.entries()).map(([name, items]) => {
      const answeredCount = items.filter(
        (it) => answers[it.question.id]?.selectedAnswer !== null && answers[it.question.id]?.selectedAnswer !== undefined,
      ).length;
      return {
        name,
        items,
        answeredCount,
        total: items.length,
      };
    });
  }, [questions, answers]);

  // Current category should be expanded by default
  const currentCategory = questions[currentIndex]
    ? categoryKeyOf(questions[currentIndex])
    : categoriesData[0]?.name;

  const isCategoryExpanded = useCallback(
    (name: string) => {
      if (expandedCategories[name] !== undefined) {
        return expandedCategories[name];
      }
      return name === currentCategory;
    },
    [expandedCategories, currentCategory],
  );

  const toggleCategory = useCallback((name: string) => {
    setExpandedCategories((prev) => {
      const current = prev[name] !== undefined ? prev[name] : name === currentCategory;
      return { ...prev, [name]: !current };
    });
  }, [currentCategory]);

  const flaggedIndices = useMemo(() => {
    return questions
      .map((q, idx) => (flags[q.id] ? idx : -1))
      .filter((idx) => idx !== -1);
  }, [questions, flags]);

  const unansweredIndices = useMemo(() => {
    return questions
      .map((q, idx) => (answers[q.id]?.selectedAnswer ? -1 : idx))
      .filter((idx) => idx !== -1);
  }, [questions, answers]);

  // Review not sure button cycles through flagged questions in order
  const handleReviewNotSure = useCallback(() => {
    if (flaggedIndices.length === 0) return;
    const nextIdx = flaggedIndices.find((idx) => idx > currentIndex);
    const targetIndex = nextIdx !== undefined ? nextIdx : flaggedIndices[0];
    onJumpToQuestion(targetIndex);
    onClose();
  }, [flaggedIndices, currentIndex, onJumpToQuestion, onClose]);

  const handleSelectQuestion = useCallback(
    (idx: number) => {
      onJumpToQuestion(idx);
      onClose();
    },
    [onJumpToQuestion, onClose],
  );

  // Button width for 5 per row with 8px gaps in a 16px padded container
  const horizontalPadding = 32; // 16 * 2
  const gap = 8;
  const numColumns = 5;
  const itemWidth = Math.floor((windowWidth - horizontalPadding - gap * (numColumns - 1)) / numColumns);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
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
            },
          ]}
        >
          {/* Drag handle */}
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />

          {/* Title row */}
          <Row style={styles.titleRow}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              Jump to question
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              style={[
                styles.closeBtn,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <X size={18} color={theme.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </Row>

          {/* Legend */}
          <View style={styles.legendRow}>
            {/* Answered */}
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { backgroundColor: theme.accent }]} />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                Answered
              </Text>
            </View>

            {/* Not sure */}
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendBox,
                  {
                    backgroundColor: theme.notSure.bg,
                    borderColor: theme.notSure.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: theme.notSure.dot }]} />
              </View>
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                Not sure
              </Text>
            </View>

            {/* Unanswered */}
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendBox,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                    borderWidth: 0.5,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                Unanswered
              </Text>
            </View>

            {/* Current */}
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendBox,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.ring,
                    borderWidth: 2,
                  },
                ]}
              />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                Current
              </Text>
            </View>
          </View>

          {/* Filter Switch: 40px tall segmented bar */}
          <View
            style={[
              styles.filterSwitch,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            {/* All */}
            <Pressable
              onPress={() => setActiveFilter('all')}
              accessibilityRole="button"
              accessibilityLabel="Show all questions"
              style={[
                styles.filterSegment,
                activeFilter === 'all' && {
                  backgroundColor: theme.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: activeFilter === 'all' ? theme.onAccent : theme.textSecondary,
                    fontWeight: activeFilter === 'all' ? '600' : '400',
                  },
                ]}
              >
                All
              </Text>
            </Pressable>

            {/* Not sure (count) */}
            <Pressable
              onPress={() => setActiveFilter('not_sure')}
              accessibilityRole="button"
              accessibilityLabel={`Show not sure questions, ${flaggedIndices.length} total`}
              style={[
                styles.filterSegment,
                activeFilter === 'not_sure' && {
                  backgroundColor: theme.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: activeFilter === 'not_sure' ? theme.onAccent : theme.textSecondary,
                    fontWeight: activeFilter === 'not_sure' ? '600' : '400',
                  },
                ]}
              >
                {`Not sure (${flaggedIndices.length})`}
              </Text>
            </Pressable>

            {/* Unanswered */}
            <Pressable
              onPress={() => setActiveFilter('unanswered')}
              accessibilityRole="button"
              accessibilityLabel={`Show unanswered questions, ${unansweredIndices.length} total`}
              style={[
                styles.filterSegment,
                activeFilter === 'unanswered' && {
                  backgroundColor: theme.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: activeFilter === 'unanswered' ? theme.onAccent : theme.textSecondary,
                    fontWeight: activeFilter === 'unanswered' ? '600' : '400',
                  },
                ]}
              >
                Unanswered
              </Text>
            </Pressable>
          </View>

          {activeFilter === 'review' ? (
            <Text style={[styles.reviewFilterHint, { color: theme.textSecondary }]}>
              Showing unanswered and not-sure questions
            </Text>
          ) : null}

          {/* Categories and Question Grids */}
          <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridContent}>
            {categoriesData.map((cat) => {
              const expanded = isCategoryExpanded(cat.name);

              // Filter category questions
              const filteredItems = cat.items.filter(({ question }) => {
                if (activeFilter === 'not_sure') return !!flags[question.id];
                if (activeFilter === 'unanswered') return !answers[question.id]?.selectedAnswer;
                if (activeFilter === 'review') {
                  return !!flags[question.id] || !answers[question.id]?.selectedAnswer;
                }
                return true;
              });

              return (
                <View key={cat.name} style={styles.categoryBlock}>
                  {/* Category Header Row */}
                  <Pressable
                    onPress={() => toggleCategory(cat.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.name}, ${cat.answeredCount} of ${cat.total} answered. Tap to ${expanded ? 'collapse' : 'expand'}`}
                    style={[
                      styles.categoryHeader,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.categoryTitle, { color: theme.text }]}>
                      {`${cat.name} (${cat.answeredCount}/${cat.total})`}
                    </Text>
                    {expanded ? (
                      <ChevronUp size={18} color={theme.textSecondary} strokeWidth={2} />
                    ) : (
                      <ChevronDown size={18} color={theme.textSecondary} strokeWidth={2} />
                    )}
                  </Pressable>

                  {/* Question Grid (5 per row) */}
                  {expanded ? (
                    filteredItems.length === 0 ? (
                      <Text style={[styles.emptyFilterText, { color: theme.textMuted }]}>
                        No questions in this filter
                      </Text>
                    ) : (
                      <View style={styles.gridContainer}>
                        {filteredItems.map(({ question, index }) => {
                          const isAnswered =
                            answers[question.id]?.selectedAnswer !== null &&
                            answers[question.id]?.selectedAnswer !== undefined;
                          const isFlagged = !!flags[question.id];
                          const isCurrent = index === currentIndex;

                          // Flagged style wins over answered style
                          let btnBg = theme.surfaceAlt;
                          let btnBorder = theme.border;
                          let btnBorderWidth = 0.5;
                          let btnTextColor = theme.text;

                          if (isFlagged) {
                            btnBg = theme.notSure.bg;
                            btnBorder = theme.notSure.border;
                            btnBorderWidth = 1;
                            btnTextColor = theme.notSure.text;
                          } else if (isAnswered) {
                            btnBg = theme.accent;
                            btnBorder = theme.accent;
                            btnTextColor = theme.onAccent;
                          }

                          if (isCurrent) {
                            btnBorder = theme.ring;
                            btnBorderWidth = 2;
                          }

                          const qNumber = question.number ?? index + 1;

                          return (
                            <Pressable
                              key={question.id}
                              onPress={() => handleSelectQuestion(index)}
                              accessibilityRole="button"
                              accessibilityLabel={`Question ${qNumber}${isFlagged ? ', marked as not sure' : ''}${isAnswered ? ', answered' : ', unanswered'}${isCurrent ? ', current question' : ''}`}
                              style={[
                                styles.gridButton,
                                {
                                  width: itemWidth,
                                  backgroundColor: btnBg,
                                  borderColor: btnBorder,
                                  borderWidth: Math.max(1, btnBorderWidth),
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.gridButtonText,
                                  {
                                    color: btnTextColor,
                                    fontWeight: isCurrent || isAnswered || isFlagged ? '600' : '400',
                                  },
                                ]}
                              >
                                {qNumber}
                              </Text>

                              {isFlagged ? (
                                <View
                                  style={[
                                    styles.gridDot,
                                    {
                                      backgroundColor: theme.notSure.dot,
                                    },
                                  ]}
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          {/* Bottom Review not sure button */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleReviewNotSure}
              disabled={flaggedIndices.length === 0}
              accessibilityRole="button"
              accessibilityLabel={`Review not sure questions, ${flaggedIndices.length} total`}
              style={[
                styles.reviewBtn,
                {
                  backgroundColor: flaggedIndices.length > 0 ? theme.accent : theme.surfaceAlt,
                  borderColor: flaggedIndices.length > 0 ? theme.accent : theme.border,
                },
              ]}
            >
              <Flag
                size={18}
                color={flaggedIndices.length > 0 ? theme.onAccent : theme.textMuted}
                strokeWidth={2}
                fill={flaggedIndices.length > 0 ? theme.onAccent : 'transparent'}
              />
              <Text
                style={[
                  styles.reviewBtnText,
                  {
                    color: flaggedIndices.length > 0 ? theme.onAccent : theme.textMuted,
                  },
                ]}
              >
                {`Review not sure (${flaggedIndices.length})`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
    maxHeight: '85%',
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
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
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
    marginBottom: 12,
    paddingHorizontal: 4,
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
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
  },
  filterSwitch: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
    flexDirection: 'row',
    marginBottom: 14,
  },
  filterSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  filterText: {
    fontSize: 13,
  },
  reviewFilterHint: {
    fontSize: 12,
    marginTop: -4,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  gridScroll: {
    flexGrow: 0,
    maxHeight: 380,
  },
  gridContent: {
    paddingBottom: 10,
  },
  categoryBlock: {
    marginBottom: 12,
  },
  categoryHeader: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyFilterText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  gridButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridButtonText: {
    fontSize: 14,
  },
  gridDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footer: {
    marginTop: 12,
  },
  reviewBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  reviewBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
