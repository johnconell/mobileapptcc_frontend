import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';

export default function NotificationsScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <Header
        title="Notifications"
        subtitle="Module updates & alerts"
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        <Card>
          <Text style={styles.itemTitle}>Question Bank Updated</Text>
          <Text style={styles.itemBody}>Version 1.2 available.</Text>
        </Card>
        <Card>
          <Text style={styles.itemTitle}>Schedule Updated</Text>
          <Text style={styles.itemBody}>New examination schedules detected.</Text>
        </Card>
        <Card>
          <Text style={styles.itemTitle}>Exam Settings Updated</Text>
          <Text style={styles.itemBody}>Time limit modified by administrator.</Text>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  itemTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  itemBody: { fontSize: 13, color: colors.inkSecondary },
});
