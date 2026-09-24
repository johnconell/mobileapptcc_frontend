import React, { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Bookmark, BookmarkCheck } from 'lucide-react-native';
import type { ChoiceKey, Question } from '@/shared/types';
import { choiceKeys } from '@/shared/utils';
import { examProcess } from '@/shared/theme/examProcess';
import { examUi, examUiPalette } from '@/shared/theme/examUi';

export type ExamAppearance = {
  fontScale: number;
  darkMode: boolean;
};

interface QuestionCardProps {
  question: Question;
  questionIndex?: number;
  totalQuestions?: number;
  selectedAnswer: ChoiceKey | null;
  onSelect: (choice: ChoiceKey) => void;
  isFlagged?: boolean;
  onToggleFlag?: () => void;
  secure?: boolean;
  appearance?: ExamAppearance;
  /** Continuous scroll card layout */
  readerMode?: boolean;
}

function cleanChoiceText(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  // Strip patterns like "A. Foo", "A) Foo", "(A) Foo", "A - Foo", "A: Foo"
  const delimited = trimmed.replace(/^(\(?[A-Da-d]\)?[:.\-–]\s*)/, '');
  if (delimited !== trimmed) {
    return delimited.trim();
  }
  // Strip "A Foo" only if there is following text (length > 2)
  if (/^[A-Da-d]\s+\S+/.test(trimmed)) {
    return trimmed.replace(/^[A-Da-d]\s+/, '').trim();
  }
  return trimmed;
}

function choiceLabel(question: Question, key: ChoiceKey): string {
  const choices = question.choices as unknown;
  if (!choices) return '';

  const indexMap: Record<ChoiceKey, number> = { A: 0, B: 1, C: 2, D: 3 };
  const idx = indexMap[key];

  let raw: unknown = undefined;
  if (Array.isArray(choices)) {
    raw = choices[idx];
  } else if (typeof choices === 'object' && choices !== null) {
    const obj = choices as Record<string, unknown>;
    raw = obj[key] ?? obj[key.toLowerCase()] ?? obj[String(idx)];
  }

  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    raw = o.text ?? o.value ?? o.label ?? o.title ?? o.name ?? '';
  }

  const str = String(raw ?? '').trim();
  return cleanChoiceText(str);
}

function QuestionCardComponent({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  onSelect,
  isFlagged = false,
  onToggleFlag,
  secure = false,
  appearance,
}: QuestionCardProps) {
  const fontScale = appearance?.fontScale ?? 1;
  const dark = appearance?.darkMode ?? false;
  const keys = choiceKeys();
  const p = examUiPalette(dark);
  const qNum =
    Number(question.number) ||
    (questionIndex !== undefined ? questionIndex + 1 : 1);
  const category = (question.category || question.subjectId || 'General').trim();

  // Optimistic local state: UI highlights instantly on touch (0ms delay)
  const [localSelection, setLocalSelection] = useState<ChoiceKey | null>(selectedAnswer);

  // Sync when parent prop changes (e.g., initial restore or navigation)
  useEffect(() => {
    setLocalSelection(selectedAnswer);
  }, [selectedAnswer]);

  const handlePress = useCallback(
    (key: ChoiceKey) => {
      // 1. Instant local visual update (zero waiting)
      setLocalSelection(key);
      // 2. Notify parent / store asynchronously
      onSelect(key);
    },
    [onSelect],
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: p.card,
          shadowColor: p.shadow,
          borderColor: isFlagged ? (dark ? '#D97706' : '#F59E0B') : p.border,
          borderWidth: isFlagged ? 1.5 : 1,
        },
      ]}
    >

      {/* Header: Q. 1/9 on left, Category + Sure/Not Sure Flag on right */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.qMeta, { color: p.muted, fontSize: 13 * fontScale }]}>
            {`Q. ${qNum}${totalQuestions ? `/${totalQuestions}` : ''}`}
          </Text>
          <Text style={[styles.categoryMeta, { color: p.muted, fontSize: 13 * fontScale }]}>
            {category}
          </Text>
        </View>

        {onToggleFlag ? (
          <Pressable
            style={[
              styles.flagBtn,
              isFlagged
                ? {
                    backgroundColor: dark ? '#451A03' : '#FEF3C7',
                    borderColor: dark ? '#B45309' : '#F59E0B',
                  }
                : {
                    backgroundColor: dark ? '#1E2235' : '#F1F5F9',
                    borderColor: p.border,
                  },
            ]}
            onPress={onToggleFlag}
            accessibilityRole="button"
            accessibilityLabel={isFlagged ? 'Marked as Not Sure. Tap to change.' : 'Marked as Sure. Tap to change.'}
            hitSlop={6}
          >
            {isFlagged ? (
              <>
                <BookmarkCheck size={13 * fontScale} color={dark ? '#FBBF24' : '#D97706'} strokeWidth={2.4} />
                <Text
                  style={[
                    styles.flagBtnText,
                    {
                      color: dark ? '#FBBF24' : '#B45309',
                      fontSize: 12 * fontScale,
                      fontFamily: examProcess.fontSemiBold,
                    },
                  ]}
                >
                  Not Sure
                </Text>
              </>
            ) : (
              <>
                <Bookmark size={13 * fontScale} color={p.muted} strokeWidth={2} />
                <Text
                  style={[
                    styles.flagBtnText,
                    {
                      color: p.muted,
                      fontSize: 12 * fontScale,
                      fontFamily: examProcess.fontMedium,
                    },
                  ]}
                >
                  Sure
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {/* Question Prompt */}
      <Text
        style={[
          styles.prompt,
          {
            color: p.ink,
            fontSize: 18 * fontScale,
            lineHeight: 26 * fontScale,
            userSelect: secure ? 'none' : 'auto',
          },
        ]}
        selectable={!secure}
        {...(secure ? ({ contextMenuHidden: true } as object) : null)}
      >
        {String(question.question ?? '')}
      </Text>

      {/* Choices: Full-container highlighted stadium pills */}
      <View style={styles.choices}>
        {keys.map((key) => {
          const isSelected = selectedAnswer === key;
          const body = choiceLabel(question, key);
          if (!body) return null;

          const containerBg = isSelected
            ? dark ? '#282746' : '#F0EEFF'
            : dark ? '#282D42' : '#ECEFF3';

          const containerBorder = isSelected ? '#7C6CF6' : 'transparent';
          const containerBorderWidth = isSelected ? 2 : 0;

          const circleBg = isSelected
            ? '#7C6CF6'
            : dark ? '#1D2132' : '#FFFFFF';

          const circleTextColor = isSelected
            ? '#FFFFFF'
            : dark ? '#94A3B8' : '#475569';

          const textColor = isSelected
            ? dark ? '#FFFFFF' : '#1E1B4B'
            : dark ? '#CBD5E1' : '#1E293B';

          const textFontFamily = isSelected
            ? examProcess.fontSemiBold
            : examProcess.fontMedium;

          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Option ${key}: ${body}`}
              onPress={() => handlePress(key)}
              onLongPress={secure ? () => undefined : undefined}
              delayLongPress={secure ? 10_000 : undefined}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.choicePill,
                    {
                      backgroundColor: pressed
                        ? dark ? '#352E5C' : '#E0E7FF'
                        : containerBg,
                      borderColor: containerBorder,
                      borderWidth: containerBorderWidth,
                    },
                  ]}
                >
                  {/* Badge Circle */}
                  <View style={[styles.choiceCircle, { backgroundColor: circleBg }]}>
                    <Text
                      style={[
                        styles.choiceCircleText,
                        {
                          color: circleTextColor,
                          fontSize: 15 * fontScale,
                          fontFamily: examProcess.fontSemiBold,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {key}
                    </Text>
                  </View>

                  {/* Choice Text */}
                  <Text
                    style={[
                      styles.choiceText,
                      {
                        color: textColor,
                        fontFamily: textFontFamily,
                        fontSize: 16 * fontScale,
                        lineHeight: 22 * fontScale,
                        fontWeight: isSelected ? '600' : '500',
                        userSelect: secure ? 'none' : 'auto',
                      },
                    ]}
                    selectable={!secure}
                    {...(secure ? ({ contextMenuHidden: true } as object) : null)}
                  >
                    {body}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function arePropsEqual(prevProps: QuestionCardProps, nextProps: QuestionCardProps) {
  return (
    prevProps.question.id === nextProps.question.id &&
    prevProps.selectedAnswer === nextProps.selectedAnswer &&
    prevProps.isFlagged === nextProps.isFlagged &&
    prevProps.appearance?.darkMode === nextProps.appearance?.darkMode &&
    prevProps.appearance?.fontScale === nextProps.appearance?.fontScale &&
    prevProps.totalQuestions === nextProps.totalQuestions &&
    prevProps.questionIndex === nextProps.questionIndex &&
    prevProps.secure === nextProps.secure &&
    prevProps.readerMode === nextProps.readerMode
  );
}

export const QuestionCard = memo(QuestionCardComponent, arePropsEqual);

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 22,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    zIndex: 1,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
    marginRight: 8,
  },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  flagBtnText: {
    letterSpacing: 0.2,
  },
  qMeta: {
    fontFamily: examProcess.fontSemiBold,
    letterSpacing: 0.3,
  },
  categoryMeta: {
    fontFamily: examProcess.fontSemiBold,
    letterSpacing: 0.3,
  },
  prompt: {
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '700',
    marginBottom: 18,
    zIndex: 1,
  },
  choices: {
    gap: 12,
    zIndex: 1,
  },
  choicePill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  choiceCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  choiceCircleText: {
    includeFontPadding: false,
    textAlign: 'center',
  },
  choiceText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
});
