import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExamTheme } from '@/shared/theme/theme';
import type { ChoiceKey } from '@/shared/types';

export interface OptionRowProps {
  optionKey: ChoiceKey;
  text: string;
  isSelected: boolean;
  onSelect: (key: ChoiceKey) => void;
  disabled?: boolean;
  fontScale?: number;
  theme: ExamTheme;
}

function OptionRowComponent({
  optionKey,
  text,
  isSelected,
  onSelect,
  disabled = false,
  fontScale = 1.0,
  theme,
}: OptionRowProps) {
  return (
    <Pressable
      onPress={() => onSelect(optionKey)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={`Option ${optionKey}: ${text}`}
      style={[
        styles.container,
        {
          backgroundColor: isSelected ? theme.accentSoft : theme.surfaceAlt,
          borderColor: isSelected ? theme.ring : theme.border,
          borderWidth: isSelected ? 1.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.circle,
          {
            backgroundColor: isSelected ? theme.accent : theme.optionLetterBg,
          },
        ]}
      >
        <Text
          style={[
            styles.letter,
            {
              color: isSelected ? theme.onAccent : theme.accentText,
            },
          ]}
        >
          {optionKey}
        </Text>
      </View>
      <Text
        style={[
          styles.text,
          {
            color: theme.text,
            fontSize: 15 * fontScale,
          },
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
}

function areOptionRowPropsEqual(prev: OptionRowProps, next: OptionRowProps) {
  return (
    prev.optionKey === next.optionKey &&
    prev.isSelected === next.isSelected &&
    prev.text === next.text &&
    prev.disabled === next.disabled &&
    prev.fontScale === next.fontScale &&
    prev.onSelect === next.onSelect &&
    prev.theme === next.theme
  );
}

export const OptionRow = memo(OptionRowComponent, areOptionRowPropsEqual);

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
    width: '100%',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  letter: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    includeFontPadding: false,
  },
  text: {
    flex: 1,
    lineHeight: 20,
    fontWeight: '400',
  },
});
