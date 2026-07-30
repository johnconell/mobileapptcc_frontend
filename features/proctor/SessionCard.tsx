import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { ChevronRight, MapPin, Users } from 'lucide-react-native';
import type { ExamSession } from '@/types';
import { colors } from '@/theme';
import { Card } from '@/components/ui';

interface SessionCardProps {
  session: ExamSession;
  onPress: () => void;
  delay?: number;
}

export function SessionCard({ session, onPress, delay = 0 }: SessionCardProps) {
  return (
    <Pressable onPress={onPress}>
      <Card delay={delay}>
        <View style={styles.row}>
          <View style={styles.meta}>
            <Text style={styles.time}>{session.timeLabel}</Text>
            <Text style={styles.batch}>{session.batchNumber}</Text>
            <View style={styles.line}>
              <MapPin size={14} color={colors.primary} />
              <Text style={styles.lineText}>{session.venue}</Text>
            </View>
            <View style={styles.line}>
              <Users size={14} color={colors.primary} />
              <Text style={styles.lineText}>{session.registeredStudents} Registered Students</Text>
            </View>
          </View>
          <ChevronRight size={22} color={colors.inkMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { flex: 1, gap: 6 },
  time: { fontSize: 17, fontWeight: '700', color: colors.ink },
  batch: { fontSize: 13, fontWeight: '700', color: colors.primary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { fontSize: 13, color: colors.inkSecondary, fontWeight: '500', flex: 1 },
});
