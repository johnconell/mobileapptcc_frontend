import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { colors } from '@/shared/theme';
import { Button } from './Button';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  const { colors: themeColors } = useAppTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: themeColors.accentMuted }]}>
        {icon ?? <Inbox size={28} color={themeColors.accent} />}
      </View>
      <Text style={[styles.title, { color: themeColors.textPrimary }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: themeColors.textMuted }]}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  btn: { marginTop: 8, minWidth: 160 },
});
