import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, FlatList, Pressable } from 'react-native';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { OfflineStore } from '@/services/offlineStore';
import { Menu } from 'lucide-react-native';
import { useProctorDrawer } from './ProctorDrawer';
import { colors } from '@/theme';
import { useRouter } from 'expo-router';

export default function HistoryScreen() {
  const router = useRouter();
  const [opened, setOpened] = useState<Array<any>>([]);

  useEffect(() => {
    void (async () => {
      const rooms = await OfflineStore.getOpenedRooms();
      const items = Object.entries(rooms).map(([key, v]) => ({ key, code: v.code, openedAt: v.openedAt, status: v.status }));
      setOpened(items);
    })();
  }, []);

  const { toggleDrawer } = useProctorDrawer();

  return (
    <View style={styles.screen}>
      <Header
        title="Examination History"
        subtitle="Previous room transactions"
        left={
            <Pressable onPress={toggleDrawer} style={styles.menuBtn}>
                <Menu size={24} color={colors.ink} />
            </Pressable>
        }
        onBack={() => router.back()}
      />
      <FlatList
        contentContainerStyle={styles.list}
        data={opened}
        ListEmptyComponent={<Text style={styles.empty}>No historical rooms recorded on this device.</Text>}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text style={styles.room}>{item.key}</Text>
            <Text style={styles.meta}>Code: {item.code}</Text>
            <Text style={styles.meta}>Opened: {new Date(item.openedAt).toLocaleString()}</Text>
            <View style={{ marginTop: 8 }}>
              <StatusChip label={item.status === 'lobby_open' ? 'Synced' : item.status} />
            </View>
          </Card>
        )}
        keyExtractor={(i) => i.key}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, gap: 12 },
  card: { padding: 12 },
  room: { fontWeight: '800', fontSize: 16, color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSecondary },
  empty: { padding: 20, color: colors.inkMuted },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
