import React from 'react';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useThemeTokens } from '@/shared/contexts/ThemeContext';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

export default function PracticeLayout() {
  const { theme } = useThemeTokens();

  return (
    <SafeAreaProvider>
      <ErrorBoundary
        fallbackTitle="Practice Mode Error"
        fallbackMessage="Practice mode encountered an unexpected display issue. Your mock examination progress is preserved in memory."
      >
        <View style={{ flex: 1, backgroundColor: theme.surface0 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.surface0 },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="scan" />
            <Stack.Screen name="passkey" />
            <Stack.Screen name="confirmation" />
            <Stack.Screen
              name="lobby"
              options={{
                gestureEnabled: false,
                animation: 'fade',
              }}
            />
            <Stack.Screen
              name="exam"
              options={{
                gestureEnabled: false,
                animation: 'none',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="submitting"
              options={{
                gestureEnabled: false,
                animation: 'fade',
              }}
            />
            <Stack.Screen name="completed" />
          </Stack>
        </View>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
