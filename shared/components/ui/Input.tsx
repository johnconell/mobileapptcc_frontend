import React from 'react';
import {
  Text,
  TextInput,
  TextInputProps,
  View,
  StyleSheet,
} from 'react-native';
import { colors, radii } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, style, ...props }: InputProps) {
  const { colors: themeColors } = useAppTheme();

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: themeColors.textSecondary }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={themeColors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: themeColors.inputBg,
            borderColor: themeColors.inputBorder,
            color: themeColors.textPrimary,
          },
          error ? styles.inputError : null,
          style,
        ]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={[styles.hint, { color: themeColors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  hint: { fontSize: 12 },
});
