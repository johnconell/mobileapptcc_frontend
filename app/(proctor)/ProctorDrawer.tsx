import React, { createContext, useContext, useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';
import { useProctorStore } from '@/stores';
import { AuthRepository } from '@/repositories';

type DrawerContextType = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const DrawerContext = createContext<DrawerContextType | null>(null);

export function useProctorDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useProctorDrawer must be used inside ProctorDrawerProvider');
  return ctx;
}

const WIDTH = Math.min(320, Math.round(Dimensions.get('window').width * 0.78));

export default function ProctorDrawerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const reset = useProctorStore((s) => s.reset);
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  const openDrawer = () => setOpen(true);
  const closeDrawer = () => setOpen(false);
  const toggleDrawer = () => setOpen((v) => !v);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-WIDTH, 0] });
  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] });

  const navigate = (path: string) => {
    closeDrawer();
    router.push(path);
  };

  const doLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AuthRepository.logout();
          reset();
          router.replace('/');
        },
      },
    ]);
  };

  const value = useMemo(() => ({ open, openDrawer, closeDrawer, toggleDrawer }), [open]);

  const proctorHidden = useProctorStore((s) => s.proctorHidden);
  const setProctorHidden = useProctorStore((s) => s.setProctorHidden);

  return (
    <DrawerContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}

        {/* Backdrop */}
        {open ? (
          <Animated.View
            pointerEvents={open ? 'auto' : 'none'}
            style={[styles.backdrop, { opacity: backdropOpacity }]}
          >
            <Pressable style={styles.backdropFill} onPress={closeDrawer} />
          </Animated.View>
        ) : null}

        <Animated.View
          style={[styles.drawer, { width: WIDTH, transform: [{ translateX }] }]}
          pointerEvents={open ? 'auto' : 'none'}
        >
          <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.menu}>
              <Text style={styles.title}>Proctor</Text>
                        {/* Toggle to hide/show proctor details in UI */}
                        <Pressable
                          style={styles.item}
                          onPress={() => setProctorHidden(!proctorHidden)}
                        >
                          <Text style={styles.itemText}>
                            {proctorHidden ? 'Show Proctor Details' : 'Hide Proctor Details'}
                          </Text>
                          <Text style={styles.itemSub} />
                        </Pressable>
              <Pressable style={styles.item} onPress={() => navigate('/(proctor)/schedules')}>
                <Text style={styles.itemText}>Dashboard</Text>
                <Text style={styles.itemSub}>Examination Schedule</Text>
              </Pressable>

              <Pressable style={styles.item} onPress={() => navigate('/(proctor)/sessions')}>
                <Text style={styles.itemText}>Active Rooms</Text>
                <Text style={styles.itemSub}>Open rooms & live lobbies</Text>
              </Pressable>

              <Pressable style={styles.item} onPress={() => navigate('/(proctor)/lobby')}>
                <Text style={styles.itemText}>Lobby Management</Text>
                <Text style={styles.itemSub}>Manage local lobbies</Text>
              </Pressable>

              <View style={styles.divider} />

              <Pressable style={styles.item} onPress={() => navigate('/(proctor)/account')}>
                <Text style={styles.itemText}>Account Settings</Text>
                <Text style={styles.itemSub}>Change name, email & password</Text>
              </Pressable>

              <Pressable style={styles.item} onPress={() => navigate('/(proctor)/history')}>
                <Text style={styles.itemText}>Examination History</Text>
                <Text style={styles.itemSub}>Previous transactions & sync status</Text>
              </Pressable>

              <Pressable style={styles.item} onPress={() => navigate('/(proctor)/notifications')}>
                <Text style={styles.itemText}>Notifications</Text>
                <Text style={styles.itemSub}>Module updates & alerts</Text>
              </Pressable>

              <Pressable style={styles.item} onPress={() => navigate('/offline-prepare')}>
                <Text style={styles.itemText}>Sync Monitor</Text>
                <Text style={styles.itemSub}>Pending records & sync status</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.logout} onPress={doLogout}>
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 80,
    backgroundColor: colors.inkMuted,
  },
  backdropFill: { flex: 1 },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 90,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  safe: { flex: 1 },
  menu: { padding: 18, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  item: { paddingVertical: 10, gap: 4 },
  itemText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: 12, color: colors.inkSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  footer: { padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  logout: { paddingVertical: 8 },
  logoutText: { color: colors.danger, fontWeight: '800' },
});
