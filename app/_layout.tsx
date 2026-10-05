import '../global.css';

import React, { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
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
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';

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

export default function RootLayout() {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hostRestoreStarted = useRef(false);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
  });

  useEffect(() => {
    const cleanupNetwork = startNetworkMonitoring();

    async function prepare() {
      await hydrateApiBaseUrl();
      await hydrate();
      await recoverOrphanedStudentKioskAtStartup();
      if (!hostRestoreStarted.current) {
        hostRestoreStarted.current = true;
        // Bind a persisted proctor room after process restart without making
        // the app shell wait on local server or foreground-service startup.
        void PeerExamServer.restore().catch((error) => {
          console.warn('[PEER RESTORE] Startup restore failed:', error);
        });
      }
      if (fontsLoaded) {
        await SplashScreen.hideAsync();
      }
    }
    void prepare();

    return () => {
      cleanupNetwork();
    };
  }, [hydrate, fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProviders>
        <ExamFlowKeepAwake />
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
      </AppProviders>
    </GestureHandlerRootView>
  );
}
