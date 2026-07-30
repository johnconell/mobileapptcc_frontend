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
  return (
    <Pressable onPress={onPress}>
      <Card delay={delay}>
        <View style={styles.row}>
          <View style={styles.meta}>
            <Text style={styles.name}>{schedule.name}</Text>
            <Text style={styles.year}>School Year {schedule.schoolYear}</Text>
            <Text style={styles.date}>{schedule.examinationDate}</Text>
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
  meta: { flex: 1, gap: 4 },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink },
  year: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  date: { fontSize: 14, color: colors.inkSecondary, fontWeight: '500', marginTop: 4 },
  batches: { fontSize: 13, color: colors.inkMuted, fontWeight: '600', marginTop: 2 },
});
