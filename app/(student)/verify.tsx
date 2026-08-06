import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Header, SearchBar, SkeletonList, EmptyState, Avatar, Card } from '@/components/ui';
import { useStudents } from '@/hooks/useRepositories';
import { StudentRepository } from '@/repositories';
import { useStudentStore } from '@/stores';
import { colors } from '@/theme';
import type { StudentRecord, StudentSelectionStatus } from '@/types';

function statusMeta(status?: StudentSelectionStatus) {
  switch (status) {
    case 'ready':
      return {
        label: 'Ready',
        color: colors.success,
        background: '#DCFCE7',
        border: '#86EFAC',
      };
    case 'completed':
      return {
        label: 'Exam Submitted',
        color: colors.inkMuted,
        background: colors.surfaceMuted,
        border: colors.border,
      };
    default:
      return {
        label: 'Not scanned',
        color: colors.inkMuted,
        background: '#F5F5F4',
        border: colors.border,
      };
  }
}

export default function VerifyStudentScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const studentsQuery = useStudents(query);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const verifiedStudent = useStudentStore((s) => s.verifiedStudent);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);

  React.useEffect(() => {
    if (!scannedSessionId) {
      router.replace('/');
    }
  }, [scannedSessionId, router]);

  // Already in waiting lobby — block re-registration via Back / reopening verify.
  React.useEffect(() => {
    if (verifiedStudent && scannedSessionId) {
      router.replace('/(student)/lobby');
    }
  }, [verifiedStudent, scannedSessionId, router]);

  const students = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data]);

  const onSelect = async (student: StudentRecord) => {
    if (student.selectionStatus === 'completed' || student.selectable === false) {
      if (student.selectionStatus === 'completed') {
        Alert.alert('Exam Submitted', 'This student has already completed the examination.');
      } else {
        Alert.alert(
          'Already checked in',
          'This student name is already selected or in the lobby.',
        );
      }
      return;
    }

    setClaimingId(student.id);
    try {
      const claimed = await StudentRepository.claimStudent(student);
      setSelectedStudent(claimed);
      await studentsQuery.refetch();
      router.push('/(student)/confirmation');
    } catch (error) {
      await studentsQuery.refetch();
      Alert.alert(
        'Unable to select',
        error instanceof Error ? error.message : 'Please choose another name.',
      );
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Student Verification"
        subtitle="Search by name or Gmail"
        onBack={() => router.back()}
      />
      <View style={styles.toolbar}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or Gmail address"
        />
        <View style={styles.legend}>
          <LegendDot color={colors.inkMuted} label="Not scanned" />
          <LegendDot color={colors.success} label="Ready" />
          <LegendDot color={colors.inkMuted} label="Submitted" locked />
        </View>
      </View>

      {studentsQuery.isLoading && !studentsQuery.data ? (
        <View style={styles.list}>
          <SkeletonList rows={6} />
        </View>
      ) : studentsQuery.isError ? (
        <EmptyState
          title="Unable to load students"
          description={
            studentsQuery.error instanceof Error
              ? studentsQuery.error.message
              : 'Check your connection and examination code, then try again.'
          }
        />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="No students found"
              description={
                query.trim()
                  ? 'Try another name or Gmail.'
                  : 'No students are registered for this examination yet.'
              }
            />
          }
          renderItem={({ item, index }) => {
            const status = item.selectionStatus ?? 'available';
            const meta = statusMeta(status);
            const canSelect = status === 'available' && claimingId !== item.id;

            return (
              <Pressable
                onPress={() => onSelect(item)}
                disabled={claimingId === item.id}
                style={({ pressed }) => [
                  !canSelect ? styles.disabledPress : null,
                  pressed && canSelect ? styles.pressed : null,
                ]}
              >
                <Card
                  delay={Math.min(index * 30, 180)}
                  style={{
                    ...styles.card,
                    borderColor: meta.border,
                    backgroundColor: meta.background,
                    ...(status === 'completed' ? styles.completedCard : {}),
                  }}
                >
                  <View style={styles.row}>
                    <View style={[styles.dot, { backgroundColor: meta.color }]} />
                    <Avatar initials={item.avatarInitials} />
                    <View style={styles.meta}>
                      <Text
                        style={[
                          styles.name,
                          status === 'completed' ? styles.nameMuted : null,
                        ]}
                      >
                        {item.fullName}
                      </Text>
                      <Text style={styles.email}>
                        {item.email || 'Gmail not on file yet'}
                      </Text>
                      <Text style={styles.program}>{item.programName}</Text>
                    </View>
                    <View style={styles.badgeCol}>
                      {status === 'completed' ? (
                        <Lock size={14} color={colors.inkMuted} />
                      ) : null}
                      <Text style={[styles.badge, { color: meta.color }]}>
                        {item.statusLabel || meta.label}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function LegendDot({
  color,
  label,
  locked,
}: {
  color: string;
  label: string;
  locked?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      {locked ? <Lock size={11} color={colors.inkMuted} /> : null}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: 20, marginBottom: 8, gap: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  list: { padding: 20, gap: 10, paddingBottom: 40 },
  card: { paddingVertical: 14, borderWidth: 1.5 },
  completedCard: { opacity: 0.72 },
  disabledPress: { opacity: 0.95 },
  pressed: { opacity: 0.9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  nameMuted: { color: colors.inkMuted },
  email: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
  program: { fontSize: 12, color: colors.inkSecondary, fontWeight: '600' },
  badgeCol: { alignItems: 'flex-end', gap: 4, maxWidth: 96 },
  badge: { fontSize: 11, fontWeight: '800', textAlign: 'right' },
});
