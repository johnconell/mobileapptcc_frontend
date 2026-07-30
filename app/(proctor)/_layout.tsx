import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ProctorLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
