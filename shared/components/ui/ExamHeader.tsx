import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { TimerCard } from './TimerCard';
import { CategoryDropdown, type CategoryItem } from './CategoryDropdown';

export interface ExamHeaderProps {
  remainingSeconds: number;
  totalDurationSeconds?: number;
  categories: CategoryItem[];
  selectedCategory: string | null;
  onSelectCategory: (key: string | null) => void;
  disabled?: boolean;
}

function ExamHeaderComponent({
  remainingSeconds,
  totalDurationSeconds = 3600,
  categories,
  selectedCategory,
  onSelectCategory,
  disabled = false,
}: ExamHeaderProps) {
  const { theme, isDark, setTheme, stepFontScale } = useTheme();

  return (
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: theme.surface,
          borderBottomColor: theme.divider,
        },
      ]}
    >
      {/* Row 1: Title + Subtitle on left; Segmented Light | Dark Switch on right */}
      <View style={styles.row1}>
        <View style={styles.titleColumn}>
          <Text style={[styles.mainTitle, { color: theme.text }]}>
            Final Examination
          </Text>
          <Text style={[styles.subTitle, { color: theme.textMuted }]}>
            College Entrance Test
          </Text>
        </View>

        {/* Labeled Segmented Switch: 44px tall, about 132px wide */}
        <View
          style={[
            styles.themeSegment,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Light Side */}
          <Pressable
            onPress={() => setTheme('light')}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Switch to Light theme"
            style={({ pressed }) => [
              styles.segmentItem,
              !isDark && {
                backgroundColor: theme.accent,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Sun
              size={16}
              color={!isDark ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.segmentText,
                {
                  color: !isDark ? theme.onAccent : theme.textSecondary,
                  fontWeight: !isDark ? '600' : '400',
                },
              ]}
            >
              Light
            </Text>
          </Pressable>

          {/* Dark Side */}
          <Pressable
            onPress={() => setTheme('dark')}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Switch to Dark theme"
            style={({ pressed }) => [
              styles.segmentItem,
              isDark && {
                backgroundColor: theme.accent,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Moon
              size={16}
              color={isDark ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.segmentText,
                {
                  color: isDark ? theme.onAccent : theme.textSecondary,
                  fontWeight: isDark ? '600' : '400',
                },
              ]}
            >
              Dark
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Row 2: Timer Card (full width, centered) */}
      <View style={styles.timerWrapper}>
        <TimerCard
          remainingSeconds={remainingSeconds}
          totalDurationSeconds={totalDurationSeconds}
        />
      </View>

      {/* Row 3: Controls row: Category dropdown on left, A- | A+ font control on right */}
      <View style={styles.controlsRow}>
        <CategoryDropdown
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={onSelectCategory}
          disabled={disabled}
        />

        {/* Font Control: 96px wide, 44px tall, two buttons separated by a divider */}
        <View
          style={[
            styles.fontControl,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
            },
          ]}
        >
          <Pressable
            onPress={() => stepFontScale(-0.1)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Decrease question font size"
            style={({ pressed }) => [
              styles.fontButton,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[styles.fontLabel, { color: theme.textSecondary, fontSize: 14 }]}>
              A-
            </Text>
          </Pressable>

          <View
            style={[
              styles.fontDivider,
              {
                backgroundColor: theme.border,
              },
            ]}
          />

          <Pressable
            onPress={() => stepFontScale(0.1)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Increase question font size"
            style={({ pressed }) => [
              styles.fontButton,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={[styles.fontLabel, { color: theme.textSecondary, fontSize: 16 }]}>
              A+
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const ExamHeader = memo(ExamHeaderComponent);

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
  },
  mainTitle: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 20,
  },
  subTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  themeSegment: {
    width: 132,
    height: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 3,
    flexDirection: 'row',
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9,
  },
  segmentText: {
    fontSize: 13,
  },
  timerWrapper: {
    marginTop: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  fontControl: {
    width: 96,
    height: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fontButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontDivider: {
    width: 0.5,
    height: 24,
  },
  fontLabel: {
    fontWeight: '500',
  },
});
