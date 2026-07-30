import React from 'react';
import { TextInput, View, StyleSheet, TextInputProps } from 'react-native';
import { Search } from 'lucide-react-native';
import { colors, radii } from '@/theme';

interface SearchBarProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search…', ...props }: SearchBarProps) {
  return (
    <View style={styles.wrap}>
      <Search size={18} color={colors.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 10,
  },
});
