import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ExamSchedule } from '@/types';
import { colors } from '@/theme';
import { Card } from '@/components/ui';

interface ScheduleCardProps {
  schedule: ExamSchedule;
  onPress: () => void;
  delay?: number;
}

export function ScheduleCard({ schedule, onPress, delay = 0 }: ScheduleCardProps) {
  // Safer date parsing for multiple Android versions
  const parseDate = (d: string) => {
    if (!d) return null;
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const p = new Date(d);
    return isNaN(p.getTime()) ? null : p;
  };

  const parsed = parseDate(schedule.examinationDateIso || schedule.examinationDate);
  const day = parsed ? String(parsed.getDate()) : '--';
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = parsed ? monthNames[parsed.getMonth()] : '---';

  const formattedDate = parsed ? parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }) : schedule.examinationDate;

  return (
    <Pressable onPress={onPress}>
      <Card delay={delay}>
        <View style={styles.row}>
          <View style={styles.dateBlock}>
            <Text style={styles.day}>{day}</Text>
            <Text style={styles.month}>{month}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.name}>{schedule.name}</Text>
            <Text style={styles.year}>School Year {schedule.schoolYear}</Text>
            <Text style={styles.date}>{formattedDate}</Text>

            {schedule.timeLabel ? (
                <Text style={styles.timeInfo}>Time: {schedule.timeLabel}</Text>
            ) : null}

            {schedule.batchNumber ? (
                <Text style={styles.batchInfo}>Batch: {schedule.batchNumber}</Text>
            ) : null}

            {schedule.venue ? (
              <Text style={styles.room}>Venue: {schedule.venue}</Text>
            ) : schedule.description && schedule.batchCount === 1 ? (
              <Text style={styles.room}>Venue: {schedule.description}</Text>
            ) : null}

            <Text style={styles.batches}>
              {schedule.batchCount} Available Session{schedule.batchCount === 1 ? '' : 's'}
            </Text>
          </View>
          <ChevronRight size={22} color={colors.inkMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBlock: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  day: { fontSize: 32, fontWeight: '900', color: colors.ink, lineHeight: 36 },
  month: { fontSize: 13, fontWeight: '800', color: colors.inkMuted, marginTop: 2 },
  meta: { flex: 1, gap: 3 },
  name: { fontSize: 17, fontWeight: '800', color: colors.ink },
  year: { fontSize: 13, fontWeight: '900', color: colors.primary, textTransform: 'uppercase' },
  date: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 1 },
  timeInfo: { fontSize: 14, fontWeight: '700', color: colors.inkSecondary },
  batchInfo: { fontSize: 14, fontWeight: '700', color: colors.inkSecondary },
  room: { fontSize: 14, fontWeight: '700', color: colors.inkSecondary },
  batches: { fontSize: 13, color: colors.inkMuted, fontWeight: '600', marginTop: 2 },
});
