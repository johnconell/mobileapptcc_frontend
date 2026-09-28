import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutGrid, Send } from 'lucide-react-native';
import { useTheme } from '@/shared/contexts/ThemeContext';

export interface BottomBarProps {
  answeredCount: number;
  totalQuestions: number;
  flaggedCount: number;
  onOpenQuestions: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

function BottomBarComponent({
  answeredCount,
  totalQuestions,
  flaggedCount,
  onOpenQuestions,
  onSubmit,
  disabled = false,
}: BottomBarProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const total = totalQuestions > 0 ? totalQuestions : 1;
  const pct = Math.max(0, Math.min(100, Math.round((answeredCount / total) * 100)));

  // Smooth 200ms animation without re-rendering question list
  const widthAnim = useRef(new Animated.Value(pct)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [pct, widthAnim]);

  const animatedWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const trackColor = isDark ? theme.border : theme.divider;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.divider,
          paddingBottom: 14 + Math.max(insets.bottom, 4),
        },
      ]}
    >
      {/* Row 1: Progress Meta + Bar */}
      <View style={styles.metaRow}>
        <Text style={[styles.progressLabel, { color: theme.text }]}>Progress</Text>
        <Text style={[styles.progressStats, { color: theme.textSecondary }]}>
          {`${answeredCount} of ${totalQuestions} answered · ${pct}%`}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              width: animatedWidth,
              minWidth: answeredCount > 0 ? 8 : 0,
              backgroundColor: theme.accent,
            },
          ]}
        />
      </View>

      {/* Row 2: Action Buttons */}
      <View style={styles.actionsRow}>
        {/* Left: Questions Button */}
        <Pressable
          onPress={onOpenQuestions}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Questions navigator, ${flaggedCount} flagged`}
          style={({ pressed }) => [
            styles.questionsBtn,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={styles.questionsTopRow}>
            <LayoutGrid size={18} color={theme.accentText} strokeWidth={2} />
            <Text style={[styles.questionsText, { color: theme.accentText }]}>
              Questions
            </Text>
          </View>
          <Text style={[styles.flaggedSubtext, { color: theme.textMuted }]}>
            {`${flaggedCount} flagged`}
          </Text>
        </Pressable>

        {/* Right: Submit Exam Button (only filled button) */}
        <Pressable
          onPress={onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Submit exam"
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: theme.accent,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Send size={18} color={theme.onAccent} strokeWidth={2.2} />
          <Text style={[styles.submitText, { color: theme.onAccent }]}>
            Submit exam
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export const BottomBar = memo(BottomBarComponent);

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 0.5,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressStats: {
    fontSize: 12,
  },
  track: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  questionsBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  questionsText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  flaggedSubtext: {
    fontSize: 11,
    marginTop: 1,
  },
  submitBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
