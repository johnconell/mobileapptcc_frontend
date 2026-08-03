import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function StudentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="scan" />
      <Stack.Screen name="enter-code" />
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
  );
}
