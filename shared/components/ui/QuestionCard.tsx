import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
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
  secure?: boolean;
  appearance?: ExamAppearance;
  /** Reader / Bible-app continuous scroll layout */
  readerMode?: boolean;
}

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
  readerMode = false,
}: QuestionCardProps) {
  const fontScale = appearance?.fontScale ?? 1;
  const dark = appearance?.darkMode ?? false;
  const keys = choiceKeys();
  const answered = Boolean(selectedAnswer);

  const palette = dark
    ? {
        ink: '#F4F4F5',
        muted: '#A1A1AA',
        verse: '#A1A1AA',
        check: '#4ADE80',
        choiceBg: '#1C1C1E',
        choiceInk: '#F4F4F5',
        selectedBg: 'rgba(34, 197, 94, 0.28)',
        selectedInk: '#ECFDF5',
        cardBg: readerMode ? 'transparent' : '#141414',
        cardBorder: readerMode ? 'transparent' : '#2A2A2A',
      }
    : {
        ink: '#1A1A2E',
        muted: examProcess.muted,
        verse: examProcess.muted,
        check: '#16A34A',
        choiceBg: '#FFFFFF',
        choiceInk: '#1A1A2E',
        selectedBg: examProcess.okBg,
        selectedInk: examProcess.okText,
        cardBg: readerMode ? 'transparent' : examProcess.cardBg,
        cardBorder: readerMode ? 'transparent' : examProcess.cardBorder,
      };

  return (
    <View
      style={[
        readerMode ? styles.readerBlock : styles.card,
        !readerMode && {
          backgroundColor: palette.cardBg,
          borderColor: palette.cardBorder,
        },
      ]}
    >
      <View style={styles.promptRow}>
        <View style={styles.numberCol}>
          <Text
            style={[
              styles.verseNum,
              {
                color: answered ? palette.check : palette.verse,
                fontSize: 13 * fontScale,
                lineHeight: 28 * fontScale,
              },
            ]}
            selectable={!secure}
          >
            {question.number}
          </Text>
          {answered ? (
            <Check size={14} color={palette.check} strokeWidth={3} />
          ) : null}
        </View>
        <Text
          style={[
            styles.prompt,
            {
              color: palette.ink,
              fontSize: 18 * fontScale,
              lineHeight: 28 * fontScale,
            },
          ]}
          selectable={!secure}
          {...(secure ? ({ contextMenuHidden: true } as object) : null)}
        >
          {String(question.question ?? '')}
        </Text>
      </View>

      <View style={styles.choices}>
        {keys.map((key) => {
          const selected = selectedAnswer === key;
          const label = choiceLabel(question, key);
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Option ${key}: ${label}`}
              onPress={() => onSelect(key)}
              onLongPress={secure ? () => undefined : undefined}
              delayLongPress={secure ? 10_000 : undefined}
              style={({ pressed }) => [
                styles.choice,
                {
                  backgroundColor: selected ? palette.selectedBg : palette.choiceBg,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  {
                    color: selected ? palette.selectedInk : palette.choiceInk,
                    fontSize: 16 * fontScale,
                    lineHeight: 22 * fontScale,
                    fontFamily: selected
                      ? examProcess.fontMedium
                      : examProcess.fontRegular,
                  },
                ]}
                selectable={!secure}
                {...(secure ? ({ contextMenuHidden: true } as object) : null)}
              >
                {label}
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
    padding: 18,
  },
  readerBlock: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 16,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  numberCol: {
    width: 28,
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  verseNum: {
    fontFamily: examProcess.fontSemiBold,
    textAlign: 'center',
  },
  prompt: {
    flex: 1,
    fontFamily: examProcess.fontSemiBold,
  },
  choices: {
    gap: 12,
    paddingLeft: 38,
  },
  choice: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    minHeight: 58,
    justifyContent: 'center',
  },
  choiceText: {
    fontFamily: examProcess.fontRegular,
  },
});
