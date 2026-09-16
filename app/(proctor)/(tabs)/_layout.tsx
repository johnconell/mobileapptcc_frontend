import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ClipboardList, BarChart3, Settings } from 'lucide-react-native';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { useSegments } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// =============================================================================
// FLOATING CAPSULE BOTTOM NAVIGATION BAR (Exact Reference App Replication)
// White pill capsule floating bottom-center, 4 icons, active is crimson circle
// =============================================================================

function CustomCapsuleTabBar({
  state,
  descriptors,
  navigation,
  pendingSyncCount,
}: BottomTabBarProps & { pendingSyncCount: number }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  return (
    <View
      style={[
        styles.tabBarWrapper,
        { bottom: Math.max(16, insets.bottom + 6) },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.capsule,
          {
            backgroundColor: isDark ? '#FFFFFF' : colors.card,
            borderColor: isDark ? '#E5E5E5' : colors.cardBorder,
            borderWidth: 1,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const renderIcon = () => {
            const iconColor = isFocused ? '#FFFFFF' : (isDark ? '#1E1E1E' : colors.textPrimary);
            const iconSize = 20;

            if (route.name === 'dashboard') {
              return <Home size={iconSize} color={iconColor} strokeWidth={2.4} />;
            }
            if (route.name === 'examination') {
              return <ClipboardList size={iconSize} color={iconColor} strokeWidth={2.4} />;
            }
            if (route.name === 'results') {
              return (
                <View style={styles.iconWithBadge}>
                  <BarChart3 size={iconSize} color={iconColor} strokeWidth={2.4} />
                  {pendingSyncCount > 0 && (
                    <View
                      style={[
                        styles.syncDot,
                        { borderColor: isFocused ? '#7A1F2B' : (isDark ? '#FFFFFF' : colors.card) },
                      ]}
                    />
                  )}
                </View>
              );
            }
            return <Settings size={iconSize} color={iconColor} strokeWidth={2.4} />;
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel || options.title || route.name}
              testID={options.tabBarButtonTestID || (options as any).tabBarTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[
                styles.tabItem,
                isFocused && styles.tabItemActive,
              ]}
              hitSlop={6}
            >
              {renderIcon()}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
      tabBar={(props) => (
        <CustomCapsuleTabBar {...props} pendingSyncCount={pendingSyncCount} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
        }}
      />
      <Tabs.Screen
        name="examination"
        options={{
          title: 'Examination',
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    minWidth: 260,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: {
        elevation: 12,
      },
      web: {
        boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.45)',
      },
    }),
  },
  tabItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: '#7A1F2B',
    ...Platform.select({
      ios: {
        shadowColor: '#7A1F2B',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0px 4px 10px rgba(232, 52, 42, 0.4)',
      },
    }),
  },
  iconWithBadge: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#DC3545',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
});
