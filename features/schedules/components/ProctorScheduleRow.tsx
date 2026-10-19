import { LockKeyhole, MapPin, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import type { ExamSession } from '@/shared/types';
import { formatScheduleOpeningTime, type ProctorScheduleAvailability } from '@/features/schedules/utils/proctorScheduleWindow';
import type { ExamSchedule } from '@/shared/types';

export type ScheduleEntry = { schedule: ExamSchedule; session: ExamSession };

type Props = {
  entry?: ScheduleEntry;
  entries?: ScheduleEntry[];
  dateLabel: string;
  mode: 'today' | 'locked';
  availability?: ProctorScheduleAvailability;
  onOpen?: () => void;
  onLockedPress?: () => void;
  badge?: string;
  status?: string;
};

function RowButton({
  title,
  disabled,
  onPress,
  backgroundColor,
  textColor,
}: {
  title: string;
  disabled: boolean;
  onPress?: () => void;
  backgroundColor: string;
  textColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor, opacity: disabled ? 0.58 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

export function ProctorScheduleRow({
  entry,
  entries,
  dateLabel,
  mode,
  availability = 'available',
  onOpen,
  onLockedPress,
  badge,
  status,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const rows = entries ?? (entry ? [entry] : []);
  const students = rows.reduce(
    (total, item) => total + Number(item.session.registeredStudents || 0),
    0,
  );
  const session = entry?.session;
  const isToday = mode === 'today';
  const openingTime =
    entry &&
    formatScheduleOpeningTime({
      date: entry.schedule.examinationDateIso || entry.schedule.examinationDate,
      startTime: session?.startTime,
      timeLabel: session?.timeLabel,
    });
  const opened = session?.status === 'lobby_open' || session?.status === 'in_progress';
  const actionDisabled =
    !isToday || availability === 'ended' || (!opened && availability !== 'available');
  const actionLabel = availability === 'ended'
    ? 'Ended'
    : opened
    ? session?.status === 'in_progress'
      ? 'Enter Exam'
      : 'Enter Lobby'
    : availability === 'too_early'
      ? openingTime
        ? `Opens at ${openingTime}`
        : 'Not open yet'
      : availability === 'checking'
          ? 'Checking time…'
          : availability === 'not_available'
            ? 'Not today'
            : availability === 'invalid'
              ? 'Unavailable'
              : 'Open Room';

  const cardStyle = [
    styles.card,
    {
      backgroundColor: isToday ? colors.card : isDark ? '#202124' : '#F0F1F2',
      borderColor: isToday ? (isDark ? '#8B6A2B' : '#B28A3A') : colors.cardBorder,
    },
    isToday ? styles.todayCard : styles.lockedCard,
  ];
  const cardContent = (
    <>
      {isToday ? <View style={styles.goldStripe} /> : null}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.titleGroup}>
            <Text style={[styles.date, { color: isToday ? colors.textPrimary : colors.textSecondary }]}>
              {isToday ? session?.timeLabel || `${session?.startTime}–${session?.endTime}` : dateLabel}
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isToday
                    ? isDark
                      ? '#51252B'
                      : '#F4E6C4'
                    : isDark
                      ? '#30343A'
                      : '#E1E4E8',
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: isToday ? (isDark ? '#F3D68A' : '#704A0B') : colors.textSecondary },
                ]}
              >
                {badge || (isToday ? 'TODAY' : 'Not today')}
              </Text>
            </View>
          </View>
          {isToday ? null : <LockKeyhole size={19} color={colors.textSecondary} />}
        </View>

        <View style={styles.detailRow}>
          {isToday ? (
            <>
              <Text style={[styles.batch, { color: colors.textPrimary }]}>
                {session?.batchNumber || 'Batch'}
              </Text>
              <View style={styles.stat}>
                <Users size={14} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {session?.registeredStudents ?? 0} students
                </Text>
              </View>
              {session?.venue ? (
                <View style={styles.stat}>
                  <MapPin size={13} color={colors.textSecondary} />
                  <Text style={[styles.statText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {session.venue}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.batch, { color: colors.textSecondary }]}>
                {rows.length} time slot{rows.length === 1 ? '' : 's'}
              </Text>
              <View style={styles.stat}>
                <Users size={14} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {students} students
                </Text>
              </View>
            </>
          )}
        </View>

        {!isToday ? (
          <View style={styles.lockedBottomRow}>
            <Text style={[styles.viewOnly, { color: colors.textSecondary }]}>View only</Text>
            {status ? (
              <Text style={[styles.viewOnly, { color: colors.textSecondary }]}>{status}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Text
              style={[
                styles.status,
                { color: availability === 'ended' ? colors.textMuted : colors.textSecondary },
              ]}
            >
              {status || (availability === 'ended' ? 'Ended' : 'Scheduled')}
            </Text>
            <RowButton
              title={actionLabel}
              disabled={actionDisabled}
              onPress={onOpen}
              backgroundColor={actionDisabled ? colors.cardMuted : '#7A1F2B'}
              textColor={actionDisabled ? colors.textSecondary : '#FFFFFF'}
            />
          </View>
        )}
      </View>
    </>
  );

  return isToday ? (
    <View style={cardStyle}>{cardContent}</View>
  ) : (
    <Pressable
      accessibilityRole="button"
      onPress={onLockedPress}
      style={({ pressed }) => [cardStyle, pressed && { opacity: 0.78 }]}
    >
      {cardContent}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  todayCard: {
    shadowColor: '#7A1F2B',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  lockedCard: {
    borderStyle: 'solid',
  },
  goldStripe: {
    width: 5,
    backgroundColor: '#B28A3A',
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 5,
  },
  batch: {
    fontSize: 13,
    fontWeight: '700',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewOnly: {
    fontSize: 11,
    fontWeight: '700',
  },
  lockedBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  status: {
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    minHeight: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
