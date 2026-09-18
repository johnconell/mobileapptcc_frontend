import React, { useState, useEffect } from 'react';
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QrCode, Shield } from 'lucide-react-native';
import { APP_NAME, SCHOOL_NAME } from '@/shared/constants';
import { colors, shadows, typography } from '@/shared/theme';
import { Card } from '@/shared/components/ui/Card';
import { FloatingButton } from '@/shared/components/ui/FloatingButton';
import { SchoolLogo } from '@/shared/components/SchoolLogo';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import * as Updates from 'expo-updates';
import * as Network from 'expo-network';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { useSettingsStore } from '@/features/settings/stores/settingsStore';
import { VersionInfo } from '@/shared/components/VersionInfo';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

/** Tracks whether the application process was just cold launched from OS */
let isAppColdBoot = true;

export default function HomeScreen() {
  const { colors: themeColors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ stay?: string; from?: string }>();
  const insets = useSafeAreaInsets();
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If a proctor session exists on this phone on initial cold launch, go straight to proctor dashboard.
  // When a user deliberately navigates here (e.g. after logout, back from login, or mode toggle),
  // stay on the landing page so applicants can scan QR code!
  // Also resume an in-progress student exam after a closed browser tab.
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
          router.replace('/(proctor)/(tabs)/dashboard');
          return;
        }

        const { tryResumeStudentExam } = await import(
          '@/features/examinations/services/resumeExamSession'
        );
        const resumed = await tryResumeStudentExam();
        if (active && resumed.ok) {
          router.replace(resumed.route);
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
    // If a live session exists, offer resume instead of showing a dead home screen.
    void (async () => {
      const session = await AuthRepository.getCachedSessionFast();
      if (session) return;
      const { appStorage } = await import('@/shared/services/storage');
      const { STORAGE_KEYS } = await import('@/shared/constants');
      const inSession = await appStorage.getItem(STORAGE_KEYS.participationToken);
      if (inSession) {
        try {
          const { tryResumeStudentExam } = await import(
            '@/features/examinations/services/resumeExamSession'
          );
          const resumed = await tryResumeStudentExam();
          if (resumed.ok) {
            router.replace(resumed.route);
            return;
          }
        } catch {
          // keep token; do not clear while an exam may still be recoverable
        }
        return;
      }
      await clearApplicantExamMaterial();
    })();
  }, [router]);

  // Join screen merges QR scan + room code. Wi‑Fi is validated after a payload is provided.
  const startTakeExam = () => {
    router.push('/(student)/scan');
  };

  const checkForUpdates = async () => {
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

      Alert.alert(
        'Update',
        'Connected via an unknown network. Proceed with update?',
        [{ text: 'Cancel' }, { text: 'Proceed', onPress: async () => void (await doFetch()) }],
      );
    } catch (err) {
      Alert.alert('Update error', String(err));
    }
  };

  if (checkingAuth) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: themeColors.background, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Proctor portal"
            onPress={() => router.push('/(proctor)/login')}
            style={[styles.headerBtn, { backgroundColor: themeColors.card, borderColor: colors.primary }]}
          >
            <Shield size={14} color={colors.primary} />
            <Text style={styles.headerBtnText}>Proctor</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check for updates"
            onPress={() => void checkForUpdates()}
            style={[
              styles.headerBtn,
              styles.updateBtn,
              { backgroundColor: themeColors.card, borderColor: colors.primary },
            ]}
          >
            <Text style={styles.headerBtnText}>Update</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.hero}>
          <SchoolLogo size="lg" />
          <Text style={styles.school}>{SCHOOL_NAME}</Text>
          <Text style={[styles.appName, { color: themeColors.textPrimary }]}>{APP_NAME}</Text>
          <Text style={[styles.tagline, { color: themeColors.textSecondary }]}>
            Secure Offline Examination
          </Text>
        </View>

        <Card style={{ backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }}>
          <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>How to take the exam</Text>
          <Text style={[styles.cardBody, { color: themeColors.textSecondary }]}>
            Connect to the examination Wi-Fi, then join with the proctor QR code or room code on one
            screen. Questions are sent from the proctor during the exam and removed from this phone
            after you submit.
          </Text>
        </Card>

        <VersionInfo />
      </ScrollView>

      <View
        style={[
          styles.fabWrap,
          {
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: themeColors.background,
          },
        ]}
      >
        <FloatingButton
          label="Take Examination"
          icon={<QrCode size={20} color={colors.white} />}
          onPress={() => void startTakeExam()}
          style={styles.fab}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarSpacer: {
    flex: 1,
  },
  headerBtn: {
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
  updateBtn: {
    paddingHorizontal: 14,
  },
  headerBtnText: {
    fontSize: 13,
    fontFamily: typography.label.fontFamily,
    color: colors.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 16,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },
  school: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: typography.label.fontFamily,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
    textAlign: 'center',
  },
  appName: {
    ...typography.hero,
    color: colors.ink,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 15,
    color: colors.inkMuted,
    fontFamily: typography.body.fontFamily,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: typography.subtitle.fontFamily,
    color: colors.ink,
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSecondary,
    fontFamily: typography.body.fontFamily,
  },
  fabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  fab: {
    width: '100%',
    maxWidth: 320,
  },
});
