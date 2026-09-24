import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { ExamAnswer, Question } from '@/shared/types';
import { examProcess } from '@/shared/theme/examProcess';

import {
  buildCategoryProgress,
  type CategoryProgress,
} from '@/features/examinations/utils/categoryProgress';

export { buildCategoryProgress, type CategoryProgress };

type ExamCategoryNavProps = {
  categories: CategoryProgress[];
  activeKey?: string | null;
  onSelect: (category: CategoryProgress | null) => void;
  darkMode?: boolean;
  showAllOption?: boolean;
  totalQuestions?: number;
  totalAnswered?: number;
};

export function ExamCategoryNav({
  categories,
  activeKey,
  onSelect,
  darkMode = false,
  showAllOption = true,
  totalQuestions,
  totalAnswered,
}: ExamCategoryNavProps) {
  const summary = useMemo(() => {
    const total = totalQuestions ?? categories.reduce((sum, c) => sum + c.total, 0);
    const answered = totalAnswered ?? categories.reduce((sum, c) => sum + c.answered, 0);
    return { total, answered };
  }, [categories, totalQuestions, totalAnswered]);

  if (categories.length === 0) return null;

  const isAllActive = !activeKey;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {showAllOption ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`All categories, ${summary.answered} of ${summary.total} answered`}
            onPress={() => onSelect(null)}
            style={[
              styles.categoryBtn,
              darkMode ? styles.categoryBtnDark : styles.categoryBtnLight,
              isAllActive && (darkMode ? styles.categoryBtnActiveDark : styles.categoryBtnActiveLight),
            ]}
          >
            <View style={styles.btnContent}>
              <Text
                style={[
                  styles.categoryBtnText,
                  darkMode ? styles.categoryBtnTextDark : styles.categoryBtnTextLight,
                  isAllActive && (darkMode ? styles.categoryBtnTextActiveDark : styles.categoryBtnTextActiveLight),
                ]}
                numberOfLines={1}
              >
                {`All (${summary.answered}/${summary.total})`}
              </Text>
            </View>
          </Pressable>
        ) : null}

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
                styles.categoryBtn,
                darkMode ? styles.categoryBtnDark : styles.categoryBtnLight,
                active && (darkMode ? styles.categoryBtnActiveDark : styles.categoryBtnActiveLight),
              ]}
            >
              <View style={styles.btnContent}>
                {complete ? (
                  <View style={[styles.completeBadge, darkMode ? styles.completeBadgeDark : styles.completeBadgeLight]}>
                    <Check size={11} color={darkMode ? '#4ADE80' : '#16A34A'} strokeWidth={3} />
                  </View>
                ) : null}
                <Text
                  style={[
                    styles.categoryBtnText,
                    darkMode ? styles.categoryBtnTextDark : styles.categoryBtnTextLight,
                    active && (darkMode ? styles.categoryBtnTextActiveDark : styles.categoryBtnTextActiveLight),
                  ]}
                  numberOfLines={1}
                >
                  {`${category.label} (${category.answered}/${category.total})`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  categoryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    // Realistic shadow / elevation
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
  },
  categoryBtnDark: {
    backgroundColor: '#1E2235',
    borderColor: '#33384F',
    shadowColor: '#000000',
  },
  categoryBtnActiveLight: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
    elevation: 3,
  },
  categoryBtnActiveDark: {
    backgroundColor: '#2E2856',
    borderColor: '#818CF8',
    elevation: 3,
  },
  categoryBtnText: {
    fontSize: 13,
    fontFamily: examProcess.fontSemiBold,
    letterSpacing: 0.2,
  },
  categoryBtnTextLight: {
    color: '#334155',
  },
  categoryBtnTextDark: {
    color: '#CBD5E1',
  },
  categoryBtnTextActiveLight: {
    color: '#4338CA',
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '700',
  },
  categoryBtnTextActiveDark: {
    color: '#E0E7FF',
    fontFamily: examProcess.fontSemiBold,
    fontWeight: '700',
  },
  completeBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBadgeLight: {
    backgroundColor: '#DCFCE7',
  },
  completeBadgeDark: {
    backgroundColor: '#14532D',
  },
});
