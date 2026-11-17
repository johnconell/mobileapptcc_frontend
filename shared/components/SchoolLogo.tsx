import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { GraduationCap } from 'lucide-react-native';
import { colors } from '@/shared/theme';
import { SCHOOL_SHORT } from '@/shared/constants';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface SchoolLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { box: 48, icon: 22, text: 11 },
  md: { box: 72, icon: 32, text: 13 },
  lg: { box: 96, icon: 40, text: 14 },
};

export function SchoolLogo({ size = 'md' }: SchoolLogoProps) {
  const { isDark, colors: themeColors } = useAppTheme();
  const s = sizes[size];
  const primaryColor = isDark ? themeColors.accent : colors.primary;
  const secondaryColor = isDark ? themeColors.accentGold : colors.secondary;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.badge,
          {
            width: s.box,
            height: s.box,
            borderRadius: s.box * 0.28,
            backgroundColor: primaryColor,
            borderColor: secondaryColor,
          },
        ]}
      >
        <GraduationCap size={s.icon} color={isDark ? themeColors.card : secondaryColor} />
      </View>
      <Text style={[styles.label, { fontSize: s.text, color: primaryColor }]}>{SCHOOL_SHORT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  label: {
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 2,
  },
});
