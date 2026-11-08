import '../global.css';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, Text, View } from 'react-native';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
} from '@expo-google-fonts/poppins';
import { AppProviders } from '@/shared/providers/AppProviders';
import { hydrateApiBaseUrl } from '@/shared/services/api';
import { useSettingsStore } from '@/features/settings/stores/settingsStore';
import { colors } from '@/shared/theme';
import { startNetworkMonitoring } from '@/features/monitoring/services/networkMonitor';
import { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
import { recoverOrphanedStudentKioskAtStartup } from '@/features/examinations/services/resumeExamSession';
import { LocalTestingBanner } from '@/features/local-testing/LocalTestingBanner';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import * as Network from 'expo-network';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import {
  isRetryableResultSyncError,
  OfflineExamRepository,
} from '@/features/synchronization/services/offlineExamRepository';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const EXAM_FLOW_KEEP_AWAKE_TAG = 'tcc-exam-flow-root';

/** Keep the display awake across navigation for the complete live exam flow. */
function ExamFlowKeepAwake() {
  const batteryPromptShown = useRef(false);
  const segments = useSegments() as readonly string[];
  const group = segments[0];
  const screen = segments[1];
  const isStudentExamFlow =
    group === '(student)' &&
    ['lobby', 'exam', 'submitting', 'completed'].includes(String(screen));
  const isProctorMonitoring = group === '(proctor)' && screen === 'lobby';
  const enabled = isStudentExamFlow || isProctorMonitoring;

  useEffect(() => {
    let disposed = false;
    const activate = async () => {
      try {
        await activateKeepAwakeAsync(EXAM_FLOW_KEEP_AWAKE_TAG);
        if (disposed) deactivateKeepAwake(EXAM_FLOW_KEEP_AWAKE_TAG);
      } catch {
        // Expo Go/web may not support a native keep-awake lock.
      }
    };

    if (enabled) {
      void activate();
    } else {
      deactivateKeepAwake(EXAM_FLOW_KEEP_AWAKE_TAG);
      batteryPromptShown.current = false;
    }
    if (isStudentExamFlow && screen === 'exam' && Platform.OS === 'android' && !batteryPromptShown.current) {
      batteryPromptShown.current = true;
      void ExamSecurityService.isIgnoringBatteryOptimizations().then((isExempt) => {
        if (disposed || isExempt) return;
        Alert.alert(
          'Allow reliable exam sessions',
          'Android battery optimization can stop the exam connection in the background. Allow unrestricted battery use for this app so the proctor room or your exam can reconnect reliably.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open battery settings',
              onPress: () => void ExamSecurityService.requestBatteryOptimizationExemption(),
            },
          ],
        );
      });
    }
    if (isStudentExamFlow && Platform.OS === 'android') {
      void ExamSecurityService.startStudentExamKeepAlive();
    }
    if (isProctorMonitoring && Platform.OS === 'android') {
      void ExamSecurityService.startExamHostKeepAlive();
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && enabled) {
        void activate();
        if (isStudentExamFlow && Platform.OS === 'android') {
          void ExamSecurityService.startStudentExamKeepAlive();
        }
        if (isProctorMonitoring && Platform.OS === 'android') {
          void ExamSecurityService.startExamHostKeepAlive();
        }
      }
    });

    return () => {
      disposed = true;
      subscription.remove();
      deactivateKeepAwake(EXAM_FLOW_KEEP_AWAKE_TAG);
      if (isStudentExamFlow && Platform.OS === 'android') {
        void ExamSecurityService.stopStudentExamKeepAlive();
      }
    };
  }, [enabled, isStudentExamFlow, isProctorMonitoring, screen]);

  return null;
}

function AutomaticResultSync() {
  const token = useProctorStore((state) => state.profile?.token);
  const offlineSession = useProctorStore((state) => state.profile?.offlineSession);

  useEffect(() => {
    if (!token || offlineSession) return;

    let active = true;
    let syncing = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const syncWhenOnline = async () => {
      if (!active || syncing) return;
      syncing = true;
      try {
        const network = await Network.getNetworkStateAsync();
        if (!active || network.isConnected !== true || network.isInternetReachable === false) return;

        const pending = await OfflineStore.pendingResults();
        if (!active || !pending.length) return;

        const result = await OfflineExamRepository.syncQueuedToCloud();
        console.info('[RESULT SYNC] Automatic synchronization completed:', {
          confirmed: result.synced,
        });
        retryAttempt = 0;
      } catch (error) {
        console.warn('[RESULT SYNC] Automatic synchronization did not complete:', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        if (active && isRetryableResultSyncError(error)) {
          const delay = Math.min(300_000, 5_000 * 2 ** Math.min(retryAttempt, 6));
          retryAttempt += 1;
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => void syncWhenOnline(), delay);
        }
      } finally {
        syncing = false;
      }
    };

    const networkSubscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected === true && state.isInternetReachable !== false) {
        retryAttempt = 0;
        if (retryTimer) clearTimeout(retryTimer);
        void syncWhenOnline();
      }
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncWhenOnline();
    });

    void syncWhenOnline();
    return () => {
      active = false;
      networkSubscription.remove();
      appStateSubscription.remove();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [offlineSession, token]);

  return null;
}

export default function RootLayout() {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const [startupError, setStartupError] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  useEffect(() => {
    let cleanupNetwork: () => void = () => {};
    let active = true;

    async function prepare() {
      setStartupError(false);
      try {
        cleanupNetwork = startNetworkMonitoring();
        await hydrateApiBaseUrl();
        await hydrate();
        await recoverOrphanedStudentKioskAtStartup();
      } catch (error) {
        console.error('[APP STARTUP] Initialization failed:', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        if (active) setStartupError(true);
      } finally {
        if (fontsLoaded) {
          await SplashScreen.hideAsync().catch((error) => {
            console.warn('[APP STARTUP] Could not dismiss splash screen:', {
              errorName: error instanceof Error ? error.name : 'UnknownError',
            });
          });
        }
      }
    }
    void prepare();

    return () => {
      active = false;
      cleanupNetwork();
    };
  }, [hydrate, fontsLoaded, startupAttempt]);

  if (!fontsLoaded) {
    return null;
  }

  if (startupError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
          Unable to prepare the app
        </Text>
        <Text style={{ color: colors.inkSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 }}>
          Local app data could not be loaded. Your saved examination data was not intentionally cleared. Retry to recover the session.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setStartupAttempt((attempt) => attempt + 1)}
          style={{ alignSelf: 'center', marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.white, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="The app needs to recover" fallbackMessage="An unexpected screen error occurred. Your examination data is kept locally; try again or reopen the app.">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProviders>
          <ExamFlowKeepAwake />
          <AutomaticResultSync />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="offline-prepare" />
            <Stack.Screen name="(student)" />
            <Stack.Screen name="(proctor)" />
          </Stack>
          <LocalTestingBanner />
        </AppProviders>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
