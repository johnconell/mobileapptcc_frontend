import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import * as Network from 'expo-network';

/**
 * Auth switch: logged-out proctors stay on a real Stack (Login only) so hardware
 * back can pop to Landing. Logged-in proctors see tabs + pushed screens.
 * Do not render Login as a detached child — that broke goBack() after logout.
 */
export default function ProctorRootLayout() {
  const { colors } = useAppTheme();
  const profile = useProctorStore((s) => s.profile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (useProctorStore.getState().profile) return;
        const cachedSession = await AuthRepository.getCachedSessionFast();
        if (!active) return;
        if (cachedSession) {
          useProctorStore.getState().setProfile(cachedSession);
        }

        if (active) setReady(true);
        if (!cachedSession) return;

        const network = await Network.getNetworkStateAsync().catch(() => null);
        if (!active || network?.isInternetReachable !== true) return;

        const verifiedSession = await AuthRepository.getSession();
        if (!active) return;
        const currentProfile = useProctorStore.getState().profile;
        if (currentProfile?.token !== cachedSession.token) return;
        useProctorStore.getState().setProfile(verifiedSession);
      } catch (err) {
        console.warn('[PROCTOR AUTH] Session hydrate failed:', err);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={colors.tabBarActive} />
      </View>
    );
  }

  const stackOptions = {
    headerShown: false,
    contentStyle: { flex: 1, backgroundColor: colors.background },
    animation: 'slide_from_right' as const,
  };

  if (!profile) {
    return (
      <Stack screenOptions={stackOptions}>
        <Stack.Screen name="login" />
        <Stack.Screen name="index" />
      </Stack>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { flex: 1, backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="account" />
      <Stack.Screen name="lobby" />
      <Stack.Screen name="room" />
      <Stack.Screen name="rooms" />
      <Stack.Screen name="sessions" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
