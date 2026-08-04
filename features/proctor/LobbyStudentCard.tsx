import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { LobbyStudent } from '@/types';
import { colors } from '@/theme';
import { Avatar, Card, StatusChip } from '@/components/ui';

interface LobbyStudentCardProps {
  student: LobbyStudent;
  delay?: number;
  onPress?: () => void;
}

export function LobbyStudentCard({ student, delay = 0, onPress }: LobbyStudentCardProps) {
  const showReconnect =
    student.status === 'disconnected' &&
    Boolean(student.reconnectCode && /^\d{6}$/.test(student.reconnectCode));

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card delay={delay} style={styles.card}>
        <View style={styles.row}>
          <Avatar initials={student.avatarInitials} size={42} />
          <View style={styles.meta}>
            <Text style={styles.name}>{student.fullName}</Text>
            <Text style={styles.email}>{student.email}</Text>
            <Text style={styles.program}>{student.programName}</Text>
            {student.violationCount > 0 ? (
              <Text style={styles.violations}>Warnings: {student.violationCount}</Text>
            ) : null}
            {showReconnect ? (
              <View style={styles.reconnectRow}>
                <Text style={styles.reconnectLabel}>Reconnect code</Text>
                <Text style={styles.reconnectCode}>{student.reconnectCode}</Text>
                <Text style={styles.reconnectHint}>Tell the student this number</Text>
              </View>
            ) : null}
          </View>
          <StatusChip status={student.status} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  email: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
  program: { fontSize: 12, color: colors.inkSecondary, fontWeight: '600' },
  violations: { fontSize: 11, fontWeight: '700', color: colors.danger, marginTop: 2 },
  reconnectRow: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F0D9DC',
    gap: 2,
  },
  reconnectLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reconnectCode: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 6,
  },
  reconnectHint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSecondary,
  },
});
