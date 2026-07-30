import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { LobbyStudent } from '@/types';
import { colors } from '@/theme';
import { Avatar, Card, StatusChip } from '@/components/ui';

interface LobbyStudentCardProps {
  student: LobbyStudent;
  delay?: number;
}

export function LobbyStudentCard({ student, delay = 0 }: LobbyStudentCardProps) {
  return (
    <Card delay={delay} style={styles.card}>
      <View style={styles.row}>
        <Avatar initials={student.avatarInitials} size={42} />
        <View style={styles.meta}>
          <Text style={styles.name}>{student.fullName}</Text>
          <Text style={styles.email}>{student.email}</Text>
          <Text style={styles.program}>{student.programName}</Text>
        </View>
        <StatusChip status={student.status} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  email: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
  program: { fontSize: 12, color: colors.inkSecondary, fontWeight: '600' },
});
