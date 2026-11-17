import React, { forwardRef } from 'react';
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
  rightAccessory?: React.ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(
  function Input({ label, error, hint, rightAccessory, style, ...props }, ref) {
    const { colors: themeColors } = useAppTheme();

    return (
      <View style={styles.wrap}>
        {label ? <Text style={[styles.label, { color: themeColors.textSecondary }]}>{label}</Text> : null}
        <View style={styles.inputContainer}>
          <TextInput
            ref={ref}
            placeholderTextColor={themeColors.textMuted}
            style={[
              styles.input,
              {
                backgroundColor: themeColors.inputBg,
                borderColor: error ? themeColors.danger : themeColors.inputBorder,
                color: themeColors.textPrimary,
                paddingRight: rightAccessory ? 48 : 14,
              },
              style,
            ]}
            {...props}
          />
          {rightAccessory ? (
            <View style={styles.rightAccessoryContainer}>
              {rightAccessory}
            </View>
          ) : null}
        </View>
        {error ? <Text style={[styles.error, { color: themeColors.danger }]}>{error}</Text> : null}
        {!error && hint ? <Text style={[styles.hint, { color: themeColors.textMuted }]}>{hint}</Text> : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  rightAccessoryContainer: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
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
