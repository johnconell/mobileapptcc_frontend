import React, { useMemo } from 'react';
import { Pressable, Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import type { ChoiceKey, Question } from '@/shared/types';
import { choiceKeys } from '@/shared/utils';
import { examProcess } from '@/shared/theme/examProcess';

export type ExamAppearance = {
  fontScale: number;
  darkMode: boolean;
};

interface QuestionCardProps {
  question: Question;
  selectedAnswer: ChoiceKey | null;
  onSelect: (choice: ChoiceKey) => void;
  /** When true, blocks text selection / copy affordances during exam security mode */
  secure?: boolean;
  appearance?: ExamAppearance;
}

const LONG_CHOICE_CHARS = 42;

function choiceLabel(question: Question, key: ChoiceKey): string {
  const choiceVal = question.choices?.[key];
  if (choiceVal && typeof choiceVal === 'object') {
    return (
      (choiceVal as { text?: string; value?: string; label?: string }).text ??
      (choiceVal as { value?: string }).value ??
      (choiceVal as { label?: string }).label ??
      String(choiceVal)
    );
  }
  return String(choiceVal ?? '');
}

export function QuestionCard({
  question,
  selectedAnswer,
  onSelect,
  secure = false,
  appearance,
}: QuestionCardProps) {
  const fontScale = appearance?.fontScale ?? 1;
  const dark = appearance?.darkMode ?? false;
  const { width } = useWindowDimensions();

  const keys = choiceKeys();
  const useSingleColumn = useMemo(() => {
    if (width < 360) return true;
    return keys.some((key) => choiceLabel(question, key).length >= LONG_CHOICE_CHARS);
  }, [keys, question, width]);

  const palette = dark
    ? {
        cardBg: '#1A1D24',
        cardBorder: '#2E3440',
        ink: '#F3F4F6',
        muted: '#9CA3AF',
        choiceBg: '#111827',
        choiceBorder: '#374151',
        selectedBg: '#1E3A5F',
        selectedBorder: '#60A5FA',
        badgeBg: '#1F2937',
        badgeText: '#D1D5DB',
        accent: '#93C5FD',
      }
    : {
        cardBg: examProcess.cardBg,
        cardBorder: examProcess.cardBorder,
        ink: examProcess.ink,
        muted: examProcess.muted,
        choiceBg: examProcess.cardElevated,
        choiceBorder: examProcess.inputBorder,
        selectedBg: examProcess.accentSoft,
        selectedBorder: examProcess.accent,
        badgeBg: examProcess.inputBg,
        badgeText: examProcess.muted,
        accent: examProcess.accent,
      };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.cardBg,
          borderColor: palette.cardBorder,
        },
      ]}
    >
      <Text
        style={[styles.meta, { color: palette.accent, fontSize: 12 * fontScale }]}
        selectable={!secure}
      >
        {`Question ${question.number} · Multiple Choice`}
      </Text>
      <Text
        style={[
          styles.prompt,
          {
            color: palette.ink,
            fontSize: 16 * fontScale,
            lineHeight: 24 * fontScale,
          },
        ]}
        selectable={!secure}
        {...(secure ? ({ contextMenuHidden: true } as object) : null)}
      >
        {String(question.question ?? '')}
      </Text>
      <View style={[styles.choices, !useSingleColumn && styles.choicesGrid]}>
        {keys.map((key) => {
          const selected = selectedAnswer === key;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              onLongPress={secure ? () => undefined : undefined}
              delayLongPress={secure ? 10_000 : undefined}
              style={[
                styles.choice,
                !useSingleColumn && styles.choiceHalf,
                {
                  backgroundColor: selected ? palette.selectedBg : palette.choiceBg,
                  borderColor: selected ? palette.selectedBorder : palette.choiceBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: selected ? palette.selectedBorder : palette.badgeBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: selected ? (dark ? '#0B1220' : examProcess.black) : palette.badgeText,
                      fontSize: 14 * fontScale,
                    },
                  ]}
                  selectable={!secure}
                  {...(secure ? ({ contextMenuHidden: true } as object) : null)}
                >
                  {key}
                </Text>
              </View>
              <Text
                style={[
                  styles.choiceText,
                  {
                    color: palette.ink,
                    fontSize: 15 * fontScale,
                    lineHeight: 21 * fontScale,
                    fontWeight: selected ? '600' : '400',
                  },
                ]}
                selectable={!secure}
                {...(secure ? ({ contextMenuHidden: true } as object) : null)}
              >
                {choiceLabel(question, key)}
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
    borderWidth: 1,
    borderRadius: examProcess.radiusCard,
    padding: examProcess.padCard,
  },
  meta: {
    fontWeight: '700',
    marginBottom: 8,
  },
  prompt: {
    fontWeight: '600',
    marginBottom: 14,
  },
  choices: { gap: 8 },
  choicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: examProcess.radiusControl,
    padding: 12,
    width: '100%',
  },
  choiceHalf: {
    width: '48.5%',
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: examProcess.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeText: { fontWeight: '700' },
  choiceText: { flex: 1 },
});
