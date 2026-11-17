import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, LogIn, Mail, RefreshCw, Sparkles } from 'lucide-react-native';
import { APP_NAME, SCHOOL_NAME } from '@/shared/constants';
import { typography } from '@/shared/theme';
import { Button } from '@/shared/components/ui/Button';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import * as Updates from 'expo-updates';
import * as Network from 'expo-network';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { useSettingsStore } from '@/features/settings/stores/settingsStore';
import { VersionInfo } from '@/shared/components/VersionInfo';
import { clearApplicantExamMaterial } from '@/features/applicants/services/applicantExamCleanup';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import {
  examineeRedesignLayout,
  type ExamineeRedesignTheme,
  useExamineeRedesignTheme,
} from '@/shared/theme/examineeRedesign';

/** Tracks whether the application process was just cold launched from OS */
let isAppColdBoot = true;
// A cold launch can render this screen before async storage hydration finishes.
// Keep all recovery/navigation in one transaction; two concurrent replace()
// calls were the source of the welcome -> confirm -> lobby loop.
let startupRecoveryInFlight = false;

export default function HomeScreen() {
  const { colors: themeColors, isDark } = useAppTheme();
  const designTheme = useExamineeRedesignTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    stay?: string;
    from?: string;
    completed?: string;
    examExitNotice?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const handledExitNoticeRef = useRef<string | null>(null);

  // Gentle bouncing animation for the "Try Examination" pointing arrow
  const arrowBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowBounce, {
          toValue: 6,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(arrowBounce, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [arrowBounce]);

  const showPendingExitNotice = React.useCallback(async () => {
    const { appStorage } = await import('@/shared/services/storage');
    const { STORAGE_KEYS } = await import('@/shared/constants');
    const notice = await appStorage.getItem(STORAGE_KEYS.pendingExamExitNotice);
    if (!notice || handledExitNoticeRef.current === notice) return;
    handledExitNoticeRef.current = notice;
    await appStorage.deleteItem(STORAGE_KEYS.pendingExamExitNotice);
    Alert.alert('Examination update', notice);
  }, []);

  useEffect(() => {
    if (params.completed === '1') {
      setShowCompletedModal(true);
    }
  }, [params.completed]);

  useEffect(() => {
    const notice = params.examExitNotice;
    if (!notice || handledExitNoticeRef.current === notice) return;
    handledExitNoticeRef.current = notice;
    Alert.alert('Examination update', notice);
    router.setParams({ examExitNotice: undefined } as any);
  }, [params.examExitNotice, router]);

  useEffect(() => {
    void showPendingExitNotice();
  }, [showPendingExitNotice]);

  // If a proctor session exists on this phone on initial cold launch, go straight to proctor dashboard.
  // When a user deliberately navigates here (e.g. after logout, back from login, or mode toggle),
  // stay on the landing page so applicants can scan QR code!
  // Also resume an in-progress student exam after a closed browser tab.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (startupRecoveryInFlight) return;
      try {
        if (!isAppColdBoot || params.stay === '1' || params.from === 'login' || params.from === 'logout') {
          isAppColdBoot = false;
          if (active) {
            setCheckingAuth(false);
          }
          return;
        }

        startupRecoveryInFlight = true;
        isAppColdBoot = false;
        const session = await AuthRepository.getCachedSessionFast();
        if (session && active) {
          useProctorStore.getState().setProfile(session);
          const { restoreProctorDestination } = await import(
            '@/features/examinations/services/restoreProctorDestination'
          );
          const destination = await restoreProctorDestination();
          if (destination.recoveryMessage) {
            Alert.alert('Room recovery', destination.recoveryMessage);
          }
          router.replace(destination.route as any);
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
        if (active) await showPendingExitNotice();

        // Landing-page cleanup is deliberately limited to student-only material.
        // Never clear the encrypted proctor pack during a transient auth read.
        if (active) {
          const { appStorage } = await import('@/shared/services/storage');
          const { STORAGE_KEYS } = await import('@/shared/constants');
          const participation = await appStorage.getItem(STORAGE_KEYS.participationToken);
          if (!participation) {
            await clearApplicantExamMaterial({ preserveOfflinePack: true });
          }
        }
      } catch (err) {
        console.warn('Fast session check error:', err);
      } finally {
        startupRecoveryInFlight = false;
        if (active) {
          setCheckingAuth(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router, params.stay, params.from, showPendingExitNotice]);

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
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: designTheme.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check for update"
            onPress={() => setShowUpdateModal(true)}
            style={[
              styles.headerBtn,
              {
                backgroundColor: designTheme.card,
                borderColor: designTheme.cardBorder,
              },
            ]}
            hitSlop={6}
          >
            <RefreshCw size={13} color={designTheme.primary} />
            <Text style={[styles.headerBtnText, { color: designTheme.primary }]}>
              Check for update
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Proctor Login"
            onPress={() => router.push('/(proctor)/login')}
            style={[
              styles.headerBtn,
              {
                backgroundColor: designTheme.card,
                borderColor: designTheme.primary,
              },
            ]}
            hitSlop={6}
          >
            <LogIn size={13} color={designTheme.primary} />
            <Text style={[styles.headerBtnText, { color: designTheme.primary }]}>
              Proctor Login
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 10 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.logoFrame,
              {
                backgroundColor: designTheme.card,
                borderColor: designTheme.cardBorder,
              },
            ]}
          >
            <Image
              source={require('../assets/tcc-logo.png')}
              style={styles.logo}
              accessibilityLabel="Tagoloan Community College seal"
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.school, { color: designTheme.primary }]}>{SCHOOL_NAME}</Text>
          <Text style={[styles.appName, { color: designTheme.text }]}>{APP_NAME}</Text>
          <Text style={[styles.tagline, { color: designTheme.secondaryText }]}>Secure offline examination</Text>
        </View>

        <View
          style={[
            styles.instructionsCard,
            { backgroundColor: designTheme.card, borderColor: designTheme.cardBorder },
          ]}
        >
          <Text style={[styles.cardTitle, { color: designTheme.text }]}>Before you start</Text>
          <InstructionRow
            number="1"
            title="Connect to the exam Wi-Fi"
            detail="Ask your proctor for the network name"
            theme={designTheme}
          />
          <InstructionRow
            number="2"
            title="Get your examination key"
            detail="It was sent to your Gmail"
            theme={designTheme}
          />
          <InstructionRow
            number="3"
            title="Scan the room QR code"
            detail="Shown by the proctor in the room"
            theme={designTheme}
          />
        </View>

        {/* Animated Pointing Arrow & Callout */}
        <Animated.View
          style={[
            styles.tryExamPointerWrap,
            { transform: [{ translateY: arrowBounce }] },
          ]}
        >
          <View
            style={[
              styles.tryExamCallout,
              {
                backgroundColor: designTheme.warningBackground,
                borderColor: designTheme.warningBorder,
              },
            ]}
          >
            <Sparkles size={14} color={designTheme.gold} />
            <Text style={[styles.tryExamCalloutText, { color: designTheme.text }]}>
              First time? Tap below to try Practice Mode!
            </Text>
            <ArrowDown size={15} color={designTheme.gold} strokeWidth={2.5} />
          </View>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try Examination in Practice Mode"
          onPress={() => router.push('/practice/scan' as any)}
          style={[
            styles.practiceButton,
            {
              backgroundColor: designTheme.card,
              borderColor: designTheme.gold,
            },
          ]}
        >
          <View style={styles.practiceButtonContent}>
            <Sparkles size={18} color={designTheme.gold} />
            <Text style={[styles.practiceButtonText, { color: designTheme.text }]}>Try Examination</Text>
            <View style={[styles.practiceBadge, { backgroundColor: designTheme.warningBackground }]}>
              <Text style={[styles.practiceBadgeText, { color: designTheme.gold }]}>Practice Mode</Text>
            </View>
          </View>
        </Pressable>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: designTheme.background,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take Examination"
          onPress={() => void startTakeExam()}
          style={[styles.primaryButton, { backgroundColor: designTheme.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: designTheme.white }]}>Take Examination</Text>
        </Pressable>
      </View>

      <Modal
        visible={showUpdateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={[styles.completedModalOverlay, { backgroundColor: themeColors.overlay }]}>
          <View
            style={[
              styles.updateModalCard,
              {
                backgroundColor: themeColors.modal,
                borderColor: themeColors.cardBorder,
                shadowColor: isDark ? 'transparent' : '#000',
                elevation: isDark ? 0 : 8,
              },
            ]}
          >
            <View style={styles.updateModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.updateModalTitle, { color: themeColors.textPrimary }]}>App Update</Text>
                <Text style={[styles.updateModalSubtitle, { color: themeColors.textSecondary }]}>Review system information or check for the latest app update.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close system information"
                onPress={() => setShowUpdateModal(false)}
                hitSlop={10}
              >
                <Text style={[styles.updateModalClose, { color: themeColors.textSecondary }]}>×</Text>
              </Pressable>
            </View>
            <VersionInfo />
            <Button
              title="Update"
              fullWidth
              onPress={() => {
                setShowUpdateModal(false);
                void checkForUpdates();
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Completion Modal: Device Unpinned + Check Gmail notification */}
      {showCompletedModal ? (
        <Modal transparent animationType="fade" visible={showCompletedModal}>
          <View style={[styles.completedModalOverlay, { backgroundColor: themeColors.overlay }]}>
            <View
              style={[
                styles.completedModalCard,
                {
                  backgroundColor: themeColors.modal,
                  borderColor: themeColors.cardBorder,
                  shadowColor: isDark ? 'transparent' : '#000',
                  elevation: isDark ? 0 : 8,
                },
              ]}
            >
              <View
                style={[
                  styles.completedModalIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(127, 216, 164, 0.15)' : '#DCFCE7',
                  },
                ]}
              >
                <Mail size={32} color={themeColors.success} />
              </View>
              <Text style={[styles.completedModalTitle, { color: themeColors.textPrimary }]}>
                Examination Submitted
              </Text>
              <Text style={[styles.completedModalBody, { color: themeColors.textSecondary }]}>
                Your examination answers have been submitted successfully and your phone has been
                unpinned.
                {'\n\n'}
                Please check your registered Gmail account for your official examination results and score
                breakdown.
              </Text>
              <Pressable
                style={[styles.completedModalBtn, { backgroundColor: themeColors.accent }]}
                onPress={() => {
                  setShowCompletedModal(false);
                  router.setParams({ completed: undefined });
                }}
              >
                <Text
                  style={[
                    styles.completedModalBtnText,
                    { color: isDark ? themeColors.card : '#FFFFFF' },
                  ]}
                >
                  Got It
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function InstructionRow({
  number,
  title,
  detail,
  theme,
}: {
  number: string;
  title: string;
  detail: string;
  theme: ExamineeRedesignTheme;
}) {
  return (
    <View style={styles.instructionRow}>
      <View style={[styles.numberCircle, { backgroundColor: theme.primarySoft }]}>
        <Text style={[styles.numberText, { color: theme.primary }]}>{number}</Text>
      </View>
      <View style={styles.instructionCopy}>
        <Text style={[styles.instructionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.instructionDetail, { color: theme.secondaryText }]}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  topBar: {
    paddingHorizontal: examineeRedesignLayout.screenPadding,
    paddingBottom: 6,
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
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
  },
  headerBtnText: {
    fontSize: 12,
    fontFamily: typography.subtitle.fontFamily,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: examineeRedesignLayout.gap,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 2,
  },
  logoFrame: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 48,
    borderWidth: 1,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
  },
  school: {
    fontSize: 12,
    fontFamily: typography.label.fontFamily,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  appName: {
    fontSize: 30,
    lineHeight: 37,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: typography.body.fontFamily,
  },
  instructionsCard: {
    borderRadius: examineeRedesignLayout.cardRadius,
    borderWidth: 1,
    padding: examineeRedesignLayout.cardPadding,
    gap: 16,
  },
  cardTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: typography.subtitle.fontFamily,
    marginBottom: 2,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  numberCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
  },
  instructionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  instructionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.subtitle.fontFamily,
  },
  instructionDetail: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.body.fontFamily,
  },
  footer: {
    paddingHorizontal: examineeRedesignLayout.screenPadding,
    paddingTop: 10,
    gap: 14,
  },
  primaryButton: {
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: typography.subtitle.fontFamily,
  },
  tryExamPointerWrap: {
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 6,
  },
  tryExamCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  tryExamCalloutText: {
    fontSize: 12,
    fontFamily: typography.subtitle.fontFamily,
    fontWeight: '700',
  },
  practiceButton: {
    minHeight: examineeRedesignLayout.buttonHeight,
    borderRadius: examineeRedesignLayout.buttonRadius,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  practiceButtonText: {
    fontSize: 16,
    fontFamily: typography.subtitle.fontFamily,
    fontWeight: '700',
  },
  practiceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  practiceBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  completedModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  completedModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  completedModalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  completedModalTitle: {
    fontSize: 18,
    fontFamily: typography.subtitle.fontFamily,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  completedModalBody: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: typography.body.fontFamily,
  },
  completedModalBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  completedModalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: typography.subtitle.fontFamily,
  },
  updateModalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  updateModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  updateModalTitle: {
    fontSize: 18,
    fontFamily: typography.subtitle.fontFamily,
    fontWeight: '700',
    marginBottom: 4,
  },
  updateModalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: typography.body.fontFamily,
  },
  updateModalClose: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '300',
  },
});
