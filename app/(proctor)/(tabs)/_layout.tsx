import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, ClipboardList, BarChart3, Settings } from 'lucide-react-native';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { useSegments } from 'expo-router';

export default function ProctorTabsLayout() {
  const { colors, isDark } = useAppTheme();
  const segments = useSegments();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const checkPending = async () => {
      try {
        const pending = await OfflineStore.pendingResults();
        if (!cancelled) setPendingSyncCount(pending.length);
      } catch {
        if (!cancelled) setPendingSyncCount(0);
      }
    };

    void checkPending();
    const interval = setInterval(checkPending, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [segments]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 12,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarItemStyle: {
          paddingHorizontal: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="examination"
        options={{
          title: 'Examination',
          tabBarIcon: ({ color, size }) => (
            <ClipboardList size={size} color={color} strokeWidth={2.5} />
          ),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ color, size }) => (
            <View style={{ width: size + 8, height: size, alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={size} color={color} strokeWidth={2.5} />
              {pendingSyncCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: 0,
                    width: 9,
                    height: 9,
                    borderRadius: 4.5,
                    backgroundColor: '#DC3545',
                    borderWidth: 1.5,
                    borderColor: colors.tabBarBg,
                  }}
                />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} strokeWidth={2.5} />,
        }}
      />
    </Tabs>
  );
}
