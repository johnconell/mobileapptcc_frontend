import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import type { ChoiceKey, Question } from '@/types';
import { choiceKeys } from '@/utils';
import { colors, radii } from '@/theme';
import { Card } from './Card';

interface QuestionCardProps {
  question: Question;
  selectedAnswer: ChoiceKey | null;
  onSelect: (choice: ChoiceKey) => void;
}

export function QuestionCard({ question, selectedAnswer, onSelect }: QuestionCardProps) {
  return (
    <Animated.View entering={FadeInRight.duration(280)} key={question.id}>
      <Card>
        <Text style={styles.meta}>
          Question {question.number} · Multiple Choice
        </Text>
        <Text style={styles.prompt}>{question.question}</Text>
        <View style={styles.choices}>
          {choiceKeys().map((key) => {
            const selected = selectedAnswer === key;
            return (
              <Pressable
                key={key}
                onPress={() => onSelect(key)}
                style={[styles.choice, selected && styles.choiceSelected]}
              >
                <View style={[styles.badge, selected && styles.badgeSelected]}>
                  <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>
                    {key}
                  </Text>
                </View>
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                  {question.choices[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  meta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  prompt: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 26,
    marginBottom: 16,
  },
  choices: { gap: 10 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F9F0F1',
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  badgeSelected: { backgroundColor: colors.primary },
  badgeText: { fontWeight: '700', color: colors.inkSecondary },
  badgeTextSelected: { color: colors.white },
  choiceText: { flex: 1, fontSize: 15, color: colors.ink, lineHeight: 21 },
  choiceTextSelected: { fontWeight: '600', color: colors.primaryDark },
});
