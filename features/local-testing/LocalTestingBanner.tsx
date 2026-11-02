import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, typography } from '@/shared/theme';
import { isLocalApiMode, LOCAL_FIXTURE_VERSION } from './localMode';
import { resetLocalApiData } from './localApiStore';

export function LocalTestingBanner() {
  if (!isLocalApiMode()) return null;

  const reset = () => Alert.alert(
    'Reset local test data?',
    'This clears only the local API fixtures, attempts, answers, and results. Laravel data is never changed.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset local data', style: 'destructive', onPress: () => void resetLocalApiData() },
    ],
  );

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View style={styles.banner}>
        <Text style={styles.label}>LOCAL TESTING MODE · v{LOCAL_FIXTURE_VERSION}</Text>
        <Pressable accessibilityRole="button" onPress={reset} hitSlop={8}>
          <Text style={styles.reset}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, bottom: 12, zIndex: 1000, alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.full, backgroundColor: colors.primaryDark, paddingHorizontal: 14, paddingVertical: 7, ...shadows.card },
  label: { ...typography.label, color: colors.white },
  reset: { ...typography.label, color: colors.secondarySoft, textDecorationLine: 'underline' },
});

