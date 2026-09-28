import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import type { ChoiceKey, Question } from '@/shared/types';
import { choiceKeys } from '@/shared/utils';
import { OptionRow } from './OptionRow';
import { useTheme } from '@/shared/contexts/ThemeContext';

export interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: ChoiceKey | null;
  onSelect: (choice: ChoiceKey) => void;
  isFlagged: boolean;
  onToggleFlag: () => void;
  disabled?: boolean;
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

function getChoiceLabel(question: Question, key: ChoiceKey): string {
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
  questionNumber,
  totalQuestions,
  selectedAnswer,
  onSelect,
  isFlagged,
  onToggleFlag,
  disabled = false,
}: QuestionCardProps) {
  const { theme, fontScale } = useTheme();
  const keys = choiceKeys();
  const category = (question.category || question.subjectId || 'General').trim();

  const handleSelect = useCallback(
    (key: ChoiceKey) => {
      onSelect(key);
    },
    [onSelect],
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      {/* Header: Question N of Total on left, Category badge on right */}
      <View style={styles.header}>
        <Text
          style={[
            styles.questionNumberText,
            {
              color: theme.accentText,
            },
          ]}
        >
          {`Question ${questionNumber} of ${totalQuestions}`}
        </Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.badgeBg,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                color: theme.badgeText,
              },
            ]}
          >
            {category}
          </Text>
        </View>
      </View>

      {/* Question Prompt */}
      <Text
        style={[
          styles.promptText,
          {
            color: theme.text,
            fontSize: 16 * fontScale,
            lineHeight: 16 * fontScale * 1.45,
          },
        ]}
      >
        {String(question.question ?? '')}
      </Text>

      {/* 4 Full-width OptionRows */}
      <View style={styles.optionsList}>
        {keys.map((key) => {
          const body = getChoiceLabel(question, key);
          if (!body) return null;
          return (
            <OptionRow
              key={key}
              optionKey={key}
              text={body}
              isSelected={selectedAnswer === key}
              onSelect={handleSelect}
              disabled={disabled}
              fontScale={fontScale}
              theme={theme}
            />
          );
        })}
      </View>

      {/* Full-width 44px Mark as Not Sure Button */}
      <Pressable
        onPress={onToggleFlag}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={isFlagged ? 'Marked as not sure. Tap to unmark.' : 'Mark as not sure'}
        style={({ pressed }) => [
          styles.notSureBtn,
          {
            backgroundColor: isFlagged ? theme.notSure.button : theme.surfaceAlt,
            borderColor: isFlagged ? theme.notSure.border : theme.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Flag
          size={18}
          color={isFlagged ? theme.notSure.text : theme.accentText}
          strokeWidth={2}
          fill={isFlagged ? theme.notSure.dot : 'transparent'}
        />
        <Text
          style={[
            styles.notSureBtnText,
            {
              color: isFlagged ? theme.notSure.text : theme.accentText,
            },
          ]}
        >
          {isFlagged ? 'Marked as not sure' : 'Mark as not sure'}
        </Text>
      </Pressable>
    </View>
  );
}

function areQuestionCardPropsEqual(prev: QuestionCardProps, next: QuestionCardProps) {
  return (
    prev.question.id === next.question.id &&
    prev.questionNumber === next.questionNumber &&
    prev.totalQuestions === next.totalQuestions &&
    prev.selectedAnswer === next.selectedAnswer &&
    prev.isFlagged === next.isFlagged &&
    prev.disabled === next.disabled &&
    prev.onSelect === next.onSelect &&
    prev.onToggleFlag === next.onToggleFlag
  );
}

export const QuestionCard = memo(QuestionCardComponent, areQuestionCardPropsEqual);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  questionNumberText: {
    fontSize: 13,
    fontWeight: '500',
  },
  badge: {
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  promptText: {
    marginBottom: 12,
    fontWeight: '400',
  },
  optionsList: {
    flexDirection: 'column',
    gap: 8,
  },
  notSureBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  notSureBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
