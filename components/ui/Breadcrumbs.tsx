import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

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
  // Find the index of the current page (first segment without onPress)
  const currentIndex = segments.findIndex((s) => !s.onPress);

  return (
    <View style={styles.bar}>
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
                    style={styles.link}
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
                    isCurrent && styles.current,
                    isFuture && styles.future,
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
                  color={isFuture ? '#94A3B8' : '#64748B'}
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
    backgroundColor: '#EBF3FE',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
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
    color: '#0055A4',
    textDecorationLine: 'underline',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  current: {
    color: '#003366',
    fontWeight: '800',
  },
  future: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  chevron: {
    marginHorizontal: 5,
  },
});
