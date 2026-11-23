import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Layers, List } from 'lucide-react-native';
import type { ExamNavMode } from '@/features/examinations/stores/examStore';

export interface ExamViewToggleProps {
  mode: ExamNavMode;
  onToggle: () => void;
  disabled?: boolean;
  testID?: string;
  tutorialRef?: React.Ref<View>;
  onTutorialPress?: (action: () => void) => void;
}

function ExamViewToggleComponent({ mode, onToggle, disabled = false, testID, tutorialRef, onTutorialPress }: ExamViewToggleProps) {
  const isScroll = mode === 'scroll';
  const label = isScroll ? 'Scroll view' : 'One by one';
  const Icon = isScroll ? List : Layers;

  return (
    <Pressable
      ref={tutorialRef}
      testID={testID}
      onPress={onTutorialPress ? () => onTutorialPress(onToggle) : onToggle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Tap to switch view.`}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Icon size={16} color="#3B3F8F" strokeWidth={2} />
      <Text numberOfLines={1} style={styles.label}>{label}</Text>
    </Pressable>
  );
}

export const ExamViewToggle = memo(ExamViewToggleComponent);

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#3B3F8F',
    backgroundColor: '#FFFFFF',
  },
  label: { color: '#3B3F8F', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
