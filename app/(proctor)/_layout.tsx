import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Home, ClipboardList, BarChart3, Settings } from 'lucide-react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useProctorStore } from '@/stores';
import { AuthRepository } from '@/repositories';

export default function ProctorRootLayout() {
  const { colors, isDark } = useAppTheme();
  const router = useRouter();
  const segments = useSegments();
  const profile = useProctorStore((s) => s.profile);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Route Guard: Protected proctor screens require active session
  useEffect(() => {
    let active = true;
    const currentLeaf = segments[segments.length - 1];

    // Login screen is public within the proctor group
    if (currentLeaf === 'login') {
      setCheckingAuth(false);
      return;
    }

    void (async () => {
      try {
        if (profile) {
          if (active) setCheckingAuth(false);
          return;
        }

        const session = await AuthRepository.getCachedSessionFast();
        if (session && active) {
          useProctorStore.getState().setProfile(session);
          setCheckingAuth(false);
          return;
        }

        // Unauthenticated access attempt to proctor area -> immediately redirect to Landing Page!
        if (active) {
          router.replace('/');
        }
      } catch {
        if (active) router.replace('/');
      } finally {
        if (active) setCheckingAuth(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile, segments, router]);

  const currentLeaf = segments[segments.length - 1];
  if (checkingAuth && currentLeaf !== 'login') {
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
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} strokeWidth={2.5} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} strokeWidth={2.5} />,
        }}
      />
      {/* Hidden screens (no bottom tab icon, pushable via router) */}
      <Tabs.Screen name="index" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="login" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="account" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="room" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="lobby" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="sessions" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="notifications" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="rooms" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
