import React from 'react';
import { Stack, useSegments } from 'expo-router';
import { Platform, View } from 'react-native';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { useGuidedAccessStatus } from '@/features/examinations/hooks/useGuidedAccessStatus';
import { GuidedAccessBlocked } from '@/features/examinations/components/GuidedAccessBlocked';
import {
  releaseExamineeWifiUsage,
  retainExamineeWifiUsage,
} from '@/features/monitoring/services/examineeWifiBinding';

const EXAM_WIFI_BOUND_ROUTES = new Set([
  'scan',
  'enter-code',
  'passkey',
  'verify',
  'confirmation',
  'lobby',
  'exam',
  'submitting',
]);

export default function StudentLayout() {
  const { theme } = useThemeTokens();
  const segments = useSegments() as readonly string[];
  const route = String(segments[1] ?? '');
  const [guidedAccess, refreshGuidedAccess] = useGuidedAccessStatus();
  const protectedRoute = route === 'lobby' || route === 'exam';

  React.useEffect(() => {
    if (EXAM_WIFI_BOUND_ROUTES.has(route)) {
      void retainExamineeWifiUsage();
    } else {
      void releaseExamineeWifiUsage();
    }
  }, [route]);

  React.useEffect(
    () => () => {
      void releaseExamineeWifiUsage();
    },
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.surface0 }}>
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.surface0 },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="scan" />
      <Stack.Screen name="enter-code" />
      <Stack.Screen name="passkey" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="confirmation" />
      <Stack.Screen
        name="lobby"
        options={{
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="exam"
        options={{
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          animation: 'none',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="submitting"
        options={{
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          animation: 'fade',
        }}
      />
      <Stack.Screen name="completed" />
    </Stack>
    {Platform.OS === 'ios' && protectedRoute && guidedAccess !== 'enabled' ? (
      <GuidedAccessBlocked status={guidedAccess} onCheck={refreshGuidedAccess} inExam={route === 'exam'} />
    ) : null}
    </View>
  );
}
