import '../global.css';

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
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
