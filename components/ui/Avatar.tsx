import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface AvatarProps {
  initials: string;
  size?: number;
  tone?: 'primary' | 'secondary' | 'muted';
}

export function Avatar({ initials, size = 44, tone = 'primary' }: AvatarProps) {
  return (
    <View
      style={[
        styles.base,
        toneStyles[tone],
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    color: colors.white,
  },
});

const toneStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.secondary },
  muted: { backgroundColor: colors.inkMuted },
});
