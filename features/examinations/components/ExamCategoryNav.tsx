import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ExamAnswer, Question } from '@/shared/types';
import { examProcess } from '@/shared/theme/examProcess';

export type CategoryProgress = {
  key: string;
  label: string;
  total: number;
  answered: number;
  firstIndex: number;
};

export function buildCategoryProgress(
  questions: Question[],
  answers: Record<string, ExamAnswer>,
): CategoryProgress[] {
  const order: string[] = [];
  const map = new Map<string, CategoryProgress>();

  questions.forEach((question, index) => {
    const key = (question.category || question.subjectId || 'General').trim() || 'General';
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        label: key,
        total: 0,
        answered: 0,
        firstIndex: index,
      };
      map.set(key, entry);
      order.push(key);
    }
    entry.total += 1;
    if (answers[question.id]?.selectedAnswer) {
      entry.answered += 1;
    }
  });

  return order.map((key) => map.get(key)!);
}

type ExamCategoryNavProps = {
  categories: CategoryProgress[];
  activeKey?: string | null;
  onSelect: (category: CategoryProgress) => void;
};

export function ExamCategoryNav({ categories, activeKey, onSelect }: ExamCategoryNavProps) {
  const summary = useMemo(() => {
    const total = categories.reduce((sum, c) => sum + c.total, 0);
    const answered = categories.reduce((sum, c) => sum + c.answered, 0);
    return { total, answered };
  }, [categories]);

  if (categories.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>Categories</Text>
        <Text style={styles.captionAccent}>
          {summary.answered}/{summary.total} answered
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {categories.map((category) => {
          const active = category.key === activeKey;
          const complete = category.answered >= category.total && category.total > 0;
          return (
            <Pressable
              key={category.key}
              accessibilityRole="button"
              accessibilityLabel={`${category.label}, ${category.answered} of ${category.total} answered`}
              onPress={() => onSelect(category)}
              style={[
                styles.chip,
                active && styles.chipActive,
                complete && !active && styles.chipComplete,
              ]}
            >
              <View style={[styles.dot, (active || complete) && styles.dotOn]} />
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
                numberOfLines={1}
              >
                {category.label}
              </Text>
              <Text style={[styles.chipCount, active && styles.chipLabelActive]}>
                {category.answered}/{category.total}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    paddingHorizontal: examProcess.padPage,
    paddingBottom: 8,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  caption: {
    fontSize: 13,
    color: examProcess.ink,
    fontWeight: '700',
  },
  captionAccent: {
    fontSize: 12,
    color: examProcess.accent,
    fontWeight: '700',
  },
  row: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    minWidth: 120,
    maxWidth: 168,
    borderRadius: examProcess.radiusCard,
    borderWidth: 1,
    borderColor: examProcess.cardBorder,
    backgroundColor: examProcess.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  chipActive: {
    borderColor: examProcess.accent,
    backgroundColor: examProcess.accentSoft,
  },
  chipComplete: {
    borderColor: examProcess.accentMuted,
    backgroundColor: examProcess.okBg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: examProcess.progressTrack,
    marginBottom: 2,
  },
  dotOn: {
    backgroundColor: examProcess.accent,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: examProcess.ink,
  },
  chipLabelActive: {
    color: examProcess.accent,
  },
  chipCount: {
    fontSize: 11,
    fontWeight: '600',
    color: examProcess.muted,
  },
});
