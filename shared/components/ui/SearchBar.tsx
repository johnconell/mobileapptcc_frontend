import React from 'react';
import { TextInput, View, StyleSheet, TextInputProps } from 'react-native';
import { Search } from 'lucide-react-native';
import { radii } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface SearchBarProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search…', ...props }: SearchBarProps) {
  const { colors: themeColors } = useAppTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: themeColors.searchBg, borderColor: themeColors.inputBorder }]}>
      <Search size={18} color={themeColors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={themeColors.textMuted}
        style={[styles.input, { color: themeColors.textPrimary }]}
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
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
});
