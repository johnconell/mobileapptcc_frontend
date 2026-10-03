import '../global.css';

import React, { useEffect } from 'react';
import { AppState } from 'react-native';
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

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const EXAM_FLOW_KEEP_AWAKE_TAG = 'tcc-exam-flow-root';

/** Keep the display awake across navigation for the complete live exam flow. */
function ExamFlowKeepAwake() {
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
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && enabled) void activate();
    });

    return () => {
      disposed = true;
      subscription.remove();
      deactivateKeepAwake(EXAM_FLOW_KEEP_AWAKE_TAG);
    };
  }, [enabled]);

  return null;
}

export default function RootLayout() {
  const hydrate = useSettingsStore((s) => s.hydrate);
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
