import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Header, SearchBar, Loader, EmptyState, Avatar, Card } from '@/components/ui';
import { useStudents } from '@/hooks/useRepositories';
import { useStudentStore } from '@/stores';
import { colors } from '@/theme';
import type { StudentRecord } from '@/types';

export default function VerifyStudentScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const studentsQuery = useStudents(query);
  const scannedSessionId = useStudentStore((s) => s.scannedSessionId);
  const setSelectedStudent = useStudentStore((s) => s.setSelectedStudent);

  React.useEffect(() => {
    if (!scannedSessionId) {
      router.replace('/');
    }
  }, [scannedSessionId, router]);

  const students = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data]);

  const onSelect = (student: StudentRecord) => {
    setSelectedStudent(student);
    router.push('/(student)/confirmation');
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
      </View>

      {studentsQuery.isLoading ? (
        <Loader label="Loading students…" />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title="No students found" description="Try another name or Gmail." />
          }
          renderItem={({ item, index }) => (
            <Pressable onPress={() => onSelect(item)}>
              <Card delay={Math.min(index * 30, 180)} style={styles.card}>
                <View style={styles.row}>
                  <Avatar initials={item.avatarInitials} />
                  <View style={styles.meta}>
                    <Text style={styles.name}>{item.fullName}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                    <Text style={styles.program}>{item.programName}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { paddingHorizontal: 20, marginBottom: 8 },
  list: { padding: 20, gap: 10, paddingBottom: 40 },
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  email: { fontSize: 12, color: colors.inkMuted, fontWeight: '500' },
  program: { fontSize: 12, color: colors.inkSecondary, fontWeight: '600' },
});
