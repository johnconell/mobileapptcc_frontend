import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
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

export function QuestionCard({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  onSelect,
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

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: p.card,
          shadowColor: p.shadow,
          borderColor: p.border,
          borderWidth: 1,
        },
      ]}
    >
      {/* Header: Q. 1/9 on left, Category on right */}
      <View style={styles.cardHeader}>
        <Text style={[styles.qMeta, { color: p.muted, fontSize: 13 * fontScale }]}>
          {`Q. ${qNum}${totalQuestions ? `/${totalQuestions}` : ''}`}
        </Text>
        <Text style={[styles.categoryMeta, { color: p.muted, fontSize: 13 * fontScale }]}>
          {category}
        </Text>
      </View>

      {/* Question Prompt */}
      <Text
        style={[
          styles.prompt,
          {
            color: p.ink,
            fontSize: 18 * fontScale,
            lineHeight: 26 * fontScale,
          },
        ]}
        selectable={!secure}
        {...(secure ? ({ contextMenuHidden: true } as object) : null)}
      >
        {String(question.question ?? '')}
      </Text>

      {/* Choices: 4 stadium pill boxes with circular letter badges */}
      <View style={styles.choices}>
        {keys.map((key) => {
          const selected = selectedAnswer === key;
          const body = choiceLabel(question, key);
          if (!body) return null;

          const pillBg = selected
            ? dark
              ? examUi.accentSoftDark
              : examUi.accentSoftLight
            : p.pill;

          const circleBg = selected
            ? examUi.accent
            : dark
              ? '#1D2132'
              : '#FFFFFF';

          const circleTextColor = selected
            ? '#FFFFFF'
            : dark
              ? '#CBD5E1'
              : '#334155';

          const borderColor = selected ? examUi.accent : 'transparent';

          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Option ${key}: ${body}`}
              onPress={() => onSelect(key)}
              onLongPress={secure ? () => undefined : undefined}
              delayLongPress={secure ? 10_000 : undefined}
              style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: pressed ? p.pillPressed : pillBg,
                  borderColor,
                },
              ]}
            >
              <View style={[styles.choiceCircle, { backgroundColor: circleBg }]}>
                <Text
                  style={[
                    styles.choiceCircleText,
                    { color: circleTextColor, fontSize: 15 * fontScale },
                  ]}
                >
                  {key}
                </Text>
              </View>
              <Text
                style={[
                  styles.choiceText,
                  {
                    color: p.ink,
                    fontSize: 16 * fontScale,
                    lineHeight: 22 * fontScale,
                  },
                ]}
                selectable={!secure}
                {...(secure ? ({ contextMenuHidden: true } as object) : null)}
              >
                {body}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    marginBottom: 18,
  },
  choices: {
    gap: 12,
  },
  choice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
    borderWidth: 2,
  },
  choiceCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCircleText: {
    fontFamily: examProcess.fontSemiBold,
    includeFontPadding: false,
    textAlign: 'center',
  },
  choiceText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 6,
    fontFamily: examProcess.fontSemiBold,
  },
});
