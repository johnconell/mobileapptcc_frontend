import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { Tabs, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Home, ClipboardList, BarChart3, Settings, RefreshCw } from 'lucide-react-native';
import { OfflineStore } from '@/features/synchronization/services/offlineStore';
import { OfflineExamRepository } from '@/features/synchronization/services/offlineExamRepository';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const FAB_SIZE = 62;
const BAR_HEIGHT = 72;
const NOTCH_GAP = 8;
const NOTCH_RADIUS = FAB_SIZE / 2 + NOTCH_GAP;
const CORNER_RADIUS = 34;
const BRAND = '#7A1F2B';
const BAR_FILL = '#FFFFFF';
const BAR_STROKE = '#D4C4B0';
const ICON_IDLE = '#4A3F36';

/** Pill bar path with a smooth concave cradle at the top center. */
function notchedBarPath(width: number, height: number): string {
  const mid = width / 2;
  const r = CORNER_RADIUS;
  const nr = NOTCH_RADIUS;
  const blend = 10;

  return [
    `M ${r} 0`,
    `L ${mid - nr - blend} 0`,
    `C ${mid - nr - blend / 2} 0 ${mid - nr} ${blend * 0.35} ${mid - nr} ${blend}`,
    `A ${nr} ${nr} 0 0 0 ${mid + nr} ${blend}`,
    `C ${mid + nr} ${blend * 0.35} ${mid + nr + blend / 2} 0 ${mid + nr + blend} 0`,
    `L ${width - r} 0`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `L ${width} ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `L ${r} ${height}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Home',
  examination: 'Exam',
  results: 'Results',
  settings: 'Settings',
};

function CustomCapsuleTabBar({
  state,
  descriptors,
  navigation,
  pendingSyncCount,
  onSyncComplete,
}: BottomTabBarProps & {
  pendingSyncCount: number;
  onSyncComplete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [syncing, setSyncing] = useState(false);
  const [barWidth, setBarWidth] = useState(340);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      const result = await OfflineExamRepository.syncQueuedToCloud();
      onSyncComplete?.();
      Alert.alert('Sync Successful', result.message);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Connect to the internet and try again.';
      Alert.alert('Sync Status', msg);
    } finally {
      setSyncing(false);
    }
  }, [syncing, onSyncComplete]);

  const onBarLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== barWidth) setBarWidth(w);
  };

  const leftRoutes = state.routes.filter(
    (r) => r.name === 'dashboard' || r.name === 'examination',
  );
  const rightRoutes = state.routes.filter(
    (r) => r.name === 'results' || r.name === 'settings',
  );

  const renderTab = (route: (typeof state.routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
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
      navigation.emit({ type: 'tabLongPress', target: route.key });
    };

    const iconColor = isFocused ? '#FFFFFF' : ICON_IDLE;
    const iconSize = 22;
    const stroke = isFocused ? 2.6 : 2.4;

    let icon: React.ReactNode = null;
    if (route.name === 'dashboard') {
      icon = <Home size={iconSize} color={iconColor} strokeWidth={stroke} />;
    } else if (route.name === 'examination') {
      icon = <ClipboardList size={iconSize} color={iconColor} strokeWidth={stroke} />;
    } else if (route.name === 'results') {
      icon = <BarChart3 size={iconSize} color={iconColor} strokeWidth={stroke} />;
    } else {
      icon = <Settings size={iconSize} color={iconColor} strokeWidth={stroke} />;
    }

    const label = TAB_LABELS[route.name] ?? options.title ?? route.name;

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel || label}
        testID={options.tabBarButtonTestID || (options as any).tabBarTestID}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[styles.tabItem, isFocused && styles.tabItemActive]}
        hitSlop={8}
      >
        {icon}
        <Text
          style={[styles.tabLabel, isFocused ? styles.tabLabelActive : styles.tabLabelIdle]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const fabTop = -(FAB_SIZE / 2) + 10;

  return (
    <View
      style={[styles.tabBarWrapper, { bottom: Math.max(10, insets.bottom + 4) }]}
      pointerEvents="box-none"
    >
      <View style={styles.barRow} pointerEvents="box-none">
        <View style={styles.barShell} onLayout={onBarLayout}>
          <Svg
            width={barWidth}
            height={BAR_HEIGHT}
            style={styles.barSvg}
            pointerEvents="none"
          >
            <Path
              d={notchedBarPath(barWidth, BAR_HEIGHT)}
              fill={BAR_FILL}
              stroke={BAR_STROKE}
              strokeWidth={1.5}
            />
          </Svg>

          <View style={styles.tabsRow} pointerEvents="box-none">
            <View style={styles.sideGroup}>{leftRoutes.map(renderTab)}</View>
            <View style={styles.centerSpacer} />
            <View style={styles.sideGroup}>{rightRoutes.map(renderTab)}</View>
          </View>

          <Pressable
            style={[
              styles.syncFab,
              { top: fabTop },
              pendingSyncCount > 0 && styles.syncFabPending,
            ]}
            onPress={handleSync}
            disabled={syncing}
            accessibilityRole="button"
            accessibilityLabel="Sync results to Admin"
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <RefreshCw size={21} color="#FFFFFF" strokeWidth={2.7} />
                <Text style={styles.syncFabLabel}>Sync</Text>
              </>
            )}
            {pendingSyncCount > 0 && !syncing && (
              <View style={styles.syncFabBadge}>
                <Text style={styles.syncFabBadgeText}>
                  {pendingSyncCount > 99 ? '99+' : pendingSyncCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ProctorTabsLayout() {
  const segments = useSegments();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      const pending = await OfflineStore.pendingResults();
      setPendingSyncCount(pending.length);
    } catch {
      setPendingSyncCount(0);
    }
  }, []);

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
        <CustomCapsuleTabBar
          {...props}
          pendingSyncCount={pendingSyncCount}
          onSyncComplete={refreshPending}
        />
      )}
      screenOptions={{
        headerShown: false,
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="examination" options={{ title: 'Examination' }} />
      <Tabs.Screen name="results" options={{ title: 'Results' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
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
  barRow: {
    width: '100%',
    alignItems: 'center',
    paddingTop: FAB_SIZE / 2 + 6,
  },
  barShell: {
    width: '92%',
    maxWidth: 400,
    minWidth: 310,
    height: BAR_HEIGHT,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#1A1210',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
      },
      android: {
        elevation: 18,
      },
      web: {
        boxShadow: '0px 12px 32px rgba(26, 18, 16, 0.28)',
      },
    }),
  },
  barSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  tabsRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 4,
    zIndex: 1,
  },
  sideGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  centerSpacer: {
    width: FAB_SIZE + NOTCH_GAP * 2,
  },
  tabItem: {
    minWidth: 52,
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: BRAND,
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 6,
      },
      android: {
        elevation: 5,
      },
      web: {
        boxShadow: '0px 4px 12px rgba(122, 31, 43, 0.4)',
      },
    }),
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  tabLabelIdle: {
    color: ICON_IDLE,
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  syncFab: {
    position: 'absolute',
    zIndex: 3,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: {
        elevation: 18,
      },
      web: {
        boxShadow: '0px 10px 24px rgba(122, 31, 43, 0.5)',
      },
    }),
  },
  syncFabPending: {
    backgroundColor: '#9B2C3A',
  },
  syncFabLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginTop: -1,
  },
  syncFabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BRAND,
  },
  syncFabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: BRAND,
  },
});
