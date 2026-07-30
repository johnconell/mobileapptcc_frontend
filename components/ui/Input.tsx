import React from 'react';
import {
  Text,
  TextInput,
  TextInputProps,
  View,
  StyleSheet,
} from 'react-native';
import { colors, radii } from '@/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, style, ...props }: InputProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSecondary,
  },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.ink,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  hint: { fontSize: 12, color: colors.inkMuted },
});
