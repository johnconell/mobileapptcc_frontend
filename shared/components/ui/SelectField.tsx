import React from 'react';
import {
  Modal,
  Pressable,
  Text,
  View,
  StyleSheet,
  FlatList,
} from 'react-native';
import { colors, radii, shadows } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  options: SelectOption[];
  error?: string;
  onChange: (value: string) => void;
}

export function SelectField({
  label,
  value,
  placeholder = 'Select…',
  options,
  error,
  onChange,
}: SelectFieldProps) {
  const { colors: themeColors, isDark } = useAppTheme();
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: themeColors.textSecondary }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: isDark ? themeColors.inputBg : themeColors.card,
            borderColor: error ? themeColors.danger : themeColors.inputBorder,
          },
        ]}
      >
        <Text style={[styles.value, { color: selected ? themeColors.textPrimary : themeColors.textMuted }]}>
          {selected?.label ?? placeholder}
        </Text>
      </Pressable>
      {error ? <Text style={[styles.error, { color: themeColors.danger }]}>{error}</Text> : null}

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[styles.overlay, { backgroundColor: themeColors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: isDark ? '#222730' : themeColors.modal, borderTopWidth: isDark ? 1 : 0, borderColor: themeColors.cardBorder }]}>
            <Text style={[styles.sheetTitle, { color: themeColors.textPrimary }]}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item.value === value && { backgroundColor: themeColors.accentMuted }]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: item.value === value ? themeColors.accent : themeColors.textPrimary },
                      item.value === value && { fontWeight: '700' },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkSecondary },
  field: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  fieldError: { borderColor: colors.danger },
  value: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  placeholder: { color: colors.inkMuted },
  error: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '55%',
    padding: 18,
    ...shadows.card,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 10 },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  optionActive: { backgroundColor: '#F0D9DC' },
  optionText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
});
