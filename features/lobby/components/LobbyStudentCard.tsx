import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Check, UserX } from 'lucide-react-native';
import type { LobbyStudent } from '@/shared/types';
import { colors } from '@/shared/theme';
import { Avatar, Card, StatusChip } from '@/shared/components/ui';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface LobbyStudentCardProps {
  student: LobbyStudent;
  delay?: number;
  onPress?: () => void;
  onKick?: () => void;
}

export function LobbyStudentCard({
  student,
  delay = 0,
  onPress,
  onKick,
}: LobbyStudentCardProps) {
  const { colors: themeColors, isDark } = useAppTheme();
  const showReconnect =
    student.status === 'disconnected' &&
    Boolean(student.reconnectCode && /^\d{6}$/.test(student.reconnectCode));

  const isTerminated = student.status === 'terminated' || student.status === 'finished';
  const isAttended = student.attendanceStatus === 'present';

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card
        delay={delay}
        style={{
          ...styles.card,
          backgroundColor: themeColors.card,
          borderColor: isAttended
            ? isDark
              ? themeColors.success
              : '#86EFAC'
            : themeColors.cardBorder,
          borderWidth: isAttended ? 1.5 : 1,
        }}
      >
        <View style={styles.row}>
          <Avatar initials={student.avatarInitials} size={42} />
          <View style={styles.meta}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: themeColors.textPrimary }]}>{student.fullName}</Text>
              {isAttended ? (
                <View style={[styles.attendedBadge, { backgroundColor: isDark ? themeColors.successMuted : '#DCFCE7' }]}>
                  <Check size={11} color={themeColors.success} strokeWidth={2.5} />
                  <Text style={[styles.attendedBadgeText, { color: themeColors.success }]}>
                    Verified in Room
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.email, { color: themeColors.textMuted }]}>
              {`${student.studentId ? `ID: ${student.studentId} · ` : ''}${student.email}`}
            </Text>
            <Text style={[styles.program, { color: themeColors.textSecondary }]}>{student.programName}</Text>
            {student.status === 'finished' && student.submittedAt ? (
              <Text style={[styles.startPhase, { color: themeColors.success, fontWeight: '600' }]}>
                {`Submitted: ${new Date(student.submittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                {student.score != null ? ` · Score: ${student.score}%` : ''}
              </Text>
            ) : null}
            {student.status !== 'finished' && (student.downloadPercent != null || student.hashVerified != null || student.moduleReady != null || student.isReady != null) ? (
              <Text style={[styles.downloadLine, { color: themeColors.accent }]}>
                {`${Math.round(student.downloadPercent ?? (student.isReady ? 100 : 0))}% · ${
                  student.hashVerified || student.isReady ? 'Verified' : 'Downloading'
                } · ${student.moduleReady || student.isReady ? 'Ready' : 'Not ready'}`}
              </Text>
            ) : null}
            {student.status !== 'finished' ? (
              <Text style={[styles.startPhase, { color: themeColors.textSecondary }]}>
                {student.startPhase === 'entered' || student.status === 'taking_exam'
                  ? 'Entered Examination'
                  : student.startPhase === 'received'
                    ? 'Received Start Signal'
                    : student.status === 'waiting'
                      ? 'Waiting'
                      : student.status.replace(/_/g, ' ')}
              </Text>
            ) : null}
            {showReconnect ? (
              <View style={[styles.reconnectRow, { backgroundColor: themeColors.accentMuted }]}>
                <Text style={[styles.reconnectLabel, { color: themeColors.textMuted }]}>Reconnect code</Text>
                <Text style={[styles.reconnectCode, { color: themeColors.accent }]}>{student.reconnectCode}</Text>
                <Text style={[styles.reconnectHint, { color: themeColors.textSecondary }]}>Tell the student this number</Text>
              </View>
            ) : null}

            {/* Removal is separate from automatically recorded attendance. */}
            <View style={styles.attendanceActionRow}>
              {onKick && !isTerminated ? (
                <Pressable
                  style={[
                    styles.kickBtn,
                    {
                      backgroundColor: isDark ? themeColors.dangerMuted : '#FEE2E2',
                      borderColor: isDark ? 'rgba(229, 123, 133, 0.3)' : '#FCA5A5',
                    },
                  ]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onKick();
                  }}
                  hitSlop={6}
                >
                  <UserX size={13} color={themeColors.danger} strokeWidth={2} />
                  <Text style={[styles.kickBtnText, { color: themeColors.danger }]}>
                    Remove Examinee
                  </Text>
                </Pressable>
              ) : null}
            </View>
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  attendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  attendedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  email: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
  program: { fontSize: 12, color: colors.inkSecondary, fontWeight: '600' },
  downloadLine: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 4 },
  startPhase: { fontSize: 11, fontWeight: '700', color: colors.inkSecondary, marginTop: 2 },
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
  attendanceActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  kickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  kickBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
