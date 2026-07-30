import React from 'react';
import {
  Modal,
  Pressable,
  Text,
  View,
  StyleSheet,
  FlatList,
} from 'react-native';
import { colors, radii, shadows } from '@/theme';

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
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, error ? styles.fieldError : null]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]}>
          {selected?.label ?? placeholder}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.option, item.value === value && styles.optionActive]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      item.value === value && styles.optionTextActive,
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
