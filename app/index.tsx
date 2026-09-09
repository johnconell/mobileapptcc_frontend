import React, { useState, useEffect } from 'react';
import { Modal, Pressable, Text, View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Keyboard, QrCode, Shield } from 'lucide-react-native';
import { APP_NAME, SCHOOL_NAME } from '@/constants';
import { colors, shadows } from '@/theme';
import { Card } from '@/components/ui/Card';
import { FloatingButton } from '@/components/ui/FloatingButton';
import { SchoolLogo } from '@/features/student/SchoolLogo';
import { AuthRepository } from '@/repositories';
import * as Updates from 'expo-updates';
import * as Network from 'expo-network';
import { useSettingsStore, useProctorStore } from '@/stores';
import { VersionInfo } from '@/components/VersionInfo';
import { clearApplicantExamMaterial } from '@/services/applicantExamCleanup';

/** Tracks whether the application process was just cold launched from OS */
let isAppColdBoot = true;

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stay?: string; from?: string }>();
  const insets = useSafeAreaInsets();
  const [joinOpen, setJoinOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If a proctor session exists on this phone on initial cold launch, go straight to proctor dashboard.
  // When a user deliberately navigates here (e.g. after logout, back from login, or mode toggle),
  // stay on the landing page so applicants can scan QR code!
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!isAppColdBoot || params.stay === '1' || params.from === 'login' || params.from === 'logout') {
          isAppColdBoot = false;
          if (active) {
            setCheckingAuth(false);
          }
          return;
        }

        isAppColdBoot = false;
        const session = await AuthRepository.getCachedSessionFast();
        if (session && active) {
          useProctorStore.getState().setProfile(session);
          router.replace('/(proctor)/dashboard' as any);
          return;
        }
      } catch (err) {
        console.warn('Fast session check error:', err);
      } finally {
        if (active) {
          setCheckingAuth(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router, params.stay, params.from]);

  useEffect(() => {
    // Applicants must not keep leftover exam modules on the landing phone.
    // Do not wipe a live lobby/exam session if the student briefly returns here.
    void (async () => {
      const session = await AuthRepository.getCachedSessionFast();
      if (session) return;
      const { appStorage } = await import('@/services/storage');
      const { STORAGE_KEYS } = await import('@/constants');
      const inSession = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (inSession) return;
      await clearApplicantExamMaterial();
    })();
  }, []);

  // No Wi‑Fi / Hub check here — students open the scanner first.
  // Network matching is validated only AFTER a QR is scanned (or a code is submitted).
  const startTakeExam = () => {
    setJoinOpen(true);
  };

  if (checkingAuth) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Proctor portal"
          onPress={() => router.push('/(proctor)/login')}
          style={styles.proctorBtn}
        >
          <Shield size={14} color={colors.primary} />
          <Text style={styles.proctorText}>Proctor</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
          onPress={async () => {
            try {
              const allowOnCellular = useSettingsStore.getState().allowUpdatesOnCellular;
              const setAllow = useSettingsStore.getState().setAllowUpdatesOnCellular;

              const doFetch = async () => {
                Alert.alert('Update', 'Checking for updates…');
                const update = await Updates.checkForUpdateAsync();
                if (!update.isAvailable) {
                  Alert.alert('Update', 'No new update available');
                  return;
                }
                Alert.alert('Update', 'Update available — downloading now');
                await Updates.fetchUpdateAsync();
                Alert.alert('Update', 'Update downloaded — reloading to apply', [
                  { text: 'Reload now', onPress: () => void Updates.reloadAsync() },
                ]);
              };

              Alert.alert('Update', 'Checking network…');
              const net = await Network.getNetworkStateAsync();
              if (!net.isConnected || !net.isInternetReachable) {
                Alert.alert('No network', 'You must be online to check for updates.');
                return;
              }

              const type = (net.type || '').toLowerCase();
              if (type === 'wifi') {
                await doFetch();
                return;
              }

              if (type === 'cellular') {
                if (allowOnCellular) {
                  await doFetch();
                  return;
                }

                Alert.alert(
                  'Mobile data',
                  'You are on mobile data. Downloading updates may use cellular data. Proceed?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Proceed once', onPress: async () => void (await doFetch()) },
                    {
                      text: 'Always allow',
                      onPress: async () => {
                        setAllow(true);
                        await doFetch();
                      },
                    },
                  ],
                );
                return;
              }

              // Unknown connection type — default to prompting
              Alert.alert(
                'Update',
                'Connected via an unknown network. Proceed with update?',
                [{ text: 'Cancel' }, { text: 'Proceed', onPress: async () => void (await doFetch()) }],
              );
            } catch (err) {
              Alert.alert('Update error', String(err));
            }
          }}
          style={[styles.proctorBtn, styles.updateBtn]}
        >
          <Text style={[styles.proctorText, { color: colors.primary }]}>Update</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.hero}>
          <SchoolLogo size="lg" />
          <Text style={styles.school}>{SCHOOL_NAME}</Text>
          <Text style={styles.appName}>{APP_NAME}</Text>
          <Text style={styles.tagline}>Secure Offline Examination</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Card>
            <Text style={styles.cardTitle}>How to take the exam</Text>
            <Text style={styles.cardBody}>
              Connect to the examination Wi-Fi, then scan the proctor QR code or enter
              the room code. Questions are sent from the proctor during the exam and
              removed from this phone after you submit.
            </Text>
          </Card>
        </Animated.View>

        <View style={{ marginTop: 8 }}>
          <VersionInfo />
        </View>
      </View>

      <View style={[styles.fabWrap, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <FloatingButton
          label="Take Examination"
          icon={<QrCode size={20} color={colors.white} />}
          onPress={() => void startTakeExam()}
          style={styles.fab}
        />
      </View>

      <Modal
        transparent
        visible={joinOpen}
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setJoinOpen(false)} />
          <Animated.View entering={FadeInDown.springify()} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Join Examination</Text>
            <Text style={styles.sheetSub}>
              Choose how you want to enter the examination lobby.
            </Text>

            <Pressable
              style={styles.option}
              onPress={() => {
                setJoinOpen(false);
                router.push('/(student)/scan');
              }}
            >
              <View style={styles.optionIcon}>
                <QrCode size={22} color={colors.primary} />
              </View>
              <View style={styles.optionMeta}>
                <Text style={styles.optionTitle}>Scan QR Code</Text>
                <Text style={styles.optionBody}>Use your camera to scan the proctor QR.</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.option}
              onPress={() => {
                setJoinOpen(false);
                router.push('/(student)/enter-code');
              }}
            >
              <View style={styles.optionIcon}>
                <Keyboard size={22} color={colors.primary} />
              </View>
              <View style={styles.optionMeta}>
                <Text style={styles.optionTitle}>Enter Examination Code</Text>
                <Text style={styles.optionBody}>
                  For devices with damaged or unavailable cameras.
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={() => setJoinOpen(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  proctorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  updateBtn: { marginLeft: 8, paddingHorizontal: 12 },
  proctorText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  content: { flex: 1, paddingHorizontal: 20, gap: 20, justifyContent: 'center' },
  prepareSkeleton: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  prepareNote: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
    textAlign: 'center',
  },
  hero: { alignItems: 'center', gap: 8, paddingBottom: 8 },
  school: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primary,
    textAlign: 'center',
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  tagline: { fontSize: 14, color: colors.inkMuted, fontWeight: '500' },
  packCard: { borderColor: colors.border },
  packCardReady: { borderColor: colors.success, borderWidth: 1.5 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  cardBody: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary },
  progressBlock: { gap: 6, marginVertical: 8 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  progressLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSecondary },
  fabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fab: { width: '100%', maxWidth: 320 },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 12,
    ...shadows.card,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  sheetSub: { fontSize: 14, color: colors.inkSecondary, lineHeight: 20, marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionMeta: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionBody: { fontSize: 12, color: colors.inkMuted, lineHeight: 18 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontWeight: '700', color: colors.primary },
});

// small tweak styles for update button
const extra = StyleSheet.create({
  updateBtn: { marginLeft: 8, paddingHorizontal: 12 },
});

// merge into main styles to avoid adding new style object references in render
Object.assign(styles, extra);
