import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { useFontScaleActions, useThemeTokens } from '@/shared/contexts/ThemeContext';
import { TimerCard } from './TimerCard';
import { CategoryDropdown, type CategoryItem } from './CategoryDropdown';
import { Row } from './primitives';

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
  const { theme, isDark, setTheme } = useThemeTokens();
  const { stepFontScale } = useFontScaleActions();

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
      <Row style={styles.row1}>
        <View style={styles.titleColumn}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.mainTitle, { color: theme.text }]}>
            Final Examination
          </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.subTitle, { color: theme.textMuted }]}>
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
            style={[
              styles.segmentItem,
              !isDark && {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <Sun
              size={16}
              color={!isDark ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
            <Text
              numberOfLines={1}
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
            style={[
              styles.segmentItem,
              isDark && {
                backgroundColor: theme.accent,
              },
            ]}
          >
            <Moon
              size={16}
              color={isDark ? theme.onAccent : theme.textSecondary}
              strokeWidth={2}
            />
              <Text
                numberOfLines={1}
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
      </Row>

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
            style={styles.fontButton}
          >
            <Text style={[styles.fontLabel, { color: theme.accentText, fontSize: 14 }]}>
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
            style={styles.fontButton}
          >
            <Text style={[styles.fontLabel, { color: theme.accentText, fontSize: 16 }]}>
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
    borderBottomWidth: 1,
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
    width: 156,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
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
    flexShrink: 1,
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
    borderWidth: 1,
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
    width: 1,
    height: 24,
  },
  fontLabel: {
    fontWeight: '500',
  },
});
