import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

export interface BreadcrumbSegment {
  /** Display label — use actual data (schedule name, time slot, room name). */
  label: string;
  /** If defined, the segment is tappable and navigates. If undefined, it's the current page. */
  onPress?: () => void;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
}

/**
 * Route-aware breadcrumb bar for the proctor navigation flow.
 *
 * Segments without `onPress` are treated as the current page (bold, non-clickable).
 * Segments with `onPress` are clickable links.
 * Future segments (after the current page) are dimmed.
 * Horizontally scrollable so breadcrumbs NEVER truncate or clip on small phones or large font scales.
 */
export function Breadcrumbs({ segments }: BreadcrumbsProps) {
  const { colors: themeColors } = useAppTheme();
  // Find the index of the current page (first segment without onPress)
  const currentIndex = segments.findIndex((s) => !s.onPress);

  return (
    <View style={[styles.bar, { backgroundColor: themeColors.cardMuted, borderBottomColor: themeColors.cardBorder }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        bounces={false}
      >
        {segments.map((segment, index) => {
          const isCurrent = index === currentIndex;
          const isFuture = currentIndex >= 0 && index > currentIndex;
          const isLast = index === segments.length - 1;

          return (
            <View key={index} style={styles.segment}>
              {segment.onPress ? (
                <Pressable
                  onPress={segment.onPress}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={styles.linkWrap}
                >
                  <Text
                    style={[styles.link, { color: themeColors.accent }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                  >
                    {segment.label}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  style={[
                    styles.text,
                    { color: themeColors.textSecondary },
                    isCurrent && [styles.current, { color: themeColors.textPrimary }],
                    isFuture && [styles.future, { color: themeColors.textMuted }],
                  ]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                >
                  {segment.label}
                </Text>
              )}
              {!isLast && (
                <ChevronRight
                  size={12}
                  color={isFuture ? themeColors.textMuted : themeColors.textSecondary}
                  style={styles.chevron}
                />
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkWrap: {
    justifyContent: 'center',
  },
  link: {
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  current: {
    fontWeight: '800',
  },
  future: {
    fontWeight: '600',
  },
  chevron: {
    marginHorizontal: 5,
  },
});
