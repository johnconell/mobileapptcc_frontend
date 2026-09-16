import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { colors } from '@/shared/theme';

import { useAppTheme } from '@/shared/hooks/useAppTheme';

/**
 * VersionInfo — Displays current build and EAS Update information.
 * Helps verify that the latest JavaScript bundle is actually running.
 */
export function VersionInfo() {
  const { colors: themeColors, isDark } = useAppTheme();
  const {
    updateId,
    channel,
    createdAt,
    isEmbeddedLaunch,
    runtimeVersion,
  } = Updates;

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber = Constants.expoConfig?.android?.versionCode ?? '1';

  // Format the date if available
  const updateDate = createdAt ? new Date(createdAt).toLocaleString() : 'N/A';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.cardBorder,
        },
      ]}
    >
      <Text style={[styles.title, { color: themeColors.textMuted }]}>System Information</Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>App Version</Text>
        <Text style={[styles.value, { color: themeColors.textPrimary }]}>{appVersion} ({buildNumber})</Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>Runtime</Text>
        <Text style={[styles.value, { color: themeColors.textPrimary }]}>{String(runtimeVersion)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>Channel</Text>
        <Text style={[styles.value, { color: themeColors.textPrimary }]}>{channel || 'development'}</Text>
      </View>

      {updateId ? (
        <>
          <View style={styles.row}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Update ID</Text>
            <Text style={[styles.value, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">{updateId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Update Date</Text>
            <Text style={[styles.value, { color: themeColors.textPrimary }]}>{updateDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Update Group</Text>
            <Text style={[styles.value, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">{(Updates as any).updateGroup || 'N/A'}</Text>
          </View>
        </>
      ) : null}

      <View style={[styles.statusRow, { borderTopColor: themeColors.cardBorder }]}>
        <View style={[styles.dot, { backgroundColor: isEmbeddedLaunch ? colors.warning : colors.success }]} />
        <Text style={[styles.statusText, { color: themeColors.textSecondary }]}>
          {isEmbeddedLaunch ? 'RUNNING EMBEDDED BUNDLE' : 'EAS UPDATE ACTIVE'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginTop: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 12,
  },
  label: {
    fontSize: 13,
    color: colors.inkSecondary,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DEE2E6',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkSecondary,
  },
});
