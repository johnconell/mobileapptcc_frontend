import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '@/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  transparent?: boolean;
  /** Hide the left back placeholder for locked screens (kiosk). */
  hideBackSlot?: boolean;
}

export function Header({
  title,
  subtitle,
  onBack,
  left,
  right,
  transparent,
  hideBackSlot = false,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors: themeColors, scaleFont, fontMultiplier } = useAppTheme();

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + 8 },
        !transparent && [styles.solid, { backgroundColor: themeColors.background, borderBottomColor: themeColors.cardBorder }],
      ]}
    >
      <View style={styles.row}>
        {left ? (
          <View style={styles.left}>{left}</View>
        ) : onBack ? (
          <Pressable
            accessibilityRole="button"
            onPress={onBack}
            style={[styles.back, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}
            hitSlop={10}
          >
            <ChevronLeft size={22} color={themeColors.textPrimary} />
          </Pressable>
        ) : hideBackSlot ? null : (
          <View style={styles.backPlaceholder} />
        )}
        <View style={styles.center}>
          <Text
            style={[styles.title, { color: themeColors.textPrimary, fontSize: scaleFont(17) }]}
            numberOfLines={1}
            maxFontSizeMultiplier={fontMultiplier * 1.2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: themeColors.textSecondary, fontSize: scaleFont(12) }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier * 1.2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  solid: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backPlaceholder: { width: 40 },
  left: { minWidth: 40, alignItems: 'flex-start' },
  center: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  subtitle: { fontSize: 12, color: colors.inkMuted, fontWeight: '500', flexShrink: 1 },
  right: { minWidth: 40, alignItems: 'flex-end' },
});
