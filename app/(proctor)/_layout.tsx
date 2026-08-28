import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme';
import ProctorDrawerProvider from './ProctorDrawer';

export default function ProctorLayout() {
  return (
    <ProctorDrawerProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
    </ProctorDrawerProvider>
  );
}
