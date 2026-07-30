import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { colors } from '@/theme';
import { Button } from './Button';

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
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        {icon ?? <Inbox size={28} color={colors.primary} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
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
    backgroundColor: '#F0D9DC',
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
