import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useExamineeRedesignTheme } from '@/shared/theme/examineeRedesign';

export function PracticeModeChip() {
  const theme = useExamineeRedesignTheme();
  return (
    <View style={[styles.chip, { backgroundColor: theme.warningBackground, borderColor: theme.warningBorder }]}>
      <Text style={[styles.label, { color: theme.text }]}>Practice mode</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '600' },
});
