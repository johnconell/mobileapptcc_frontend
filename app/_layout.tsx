import '../global.css';

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProviders } from '@/providers/AppProviders';
import { useSettingsStore } from '@/stores';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    async function prepare() {
      await hydrate();
      await SplashScreen.hideAsync();
    }
    void prepare();
  }, [hydrate]);

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
          <Stack.Screen name="(student)" />
          <Stack.Screen name="(proctor)" />
        </Stack>
      </AppProviders>
    </GestureHandlerRootView>
  );
}
