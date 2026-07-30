import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Grid3X3, Send } from 'lucide-react-native';
import { colors } from '@/theme';

interface ExamBottomNavigationProps {
  onPrevious: () => void;
  onNext: () => void;
  onPalette: () => void;
  onSubmit: () => void;
  canPrevious: boolean;
  canNext: boolean;
  remainingUnanswered: number;
}

export function ExamBottomNavigation({
  onPrevious,
  onNext,
  onPalette,
  onSubmit,
  canPrevious,
  canNext,
  remainingUnanswered,
}: ExamBottomNavigationProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.row}>
        <NavItem
          label="Prev"
          icon={<ChevronLeft size={18} color={canPrevious ? colors.ink : colors.inkMuted} />}
          onPress={onPrevious}
          disabled={!canPrevious}
        />
        <NavItem
          label="Palette"
          icon={<Grid3X3 size={18} color={colors.ink} />}
          onPress={onPalette}
        />
        <NavItem
          label="Next"
          icon={<ChevronRight size={18} color={canNext ? colors.ink : colors.inkMuted} />}
          onPress={onNext}
          disabled={!canNext}
        />
        <Pressable style={styles.submit} onPress={onSubmit}>
          <Send size={16} color={colors.white} />
          <Text style={styles.submitText}>Submit</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        {remainingUnanswered} question{remainingUnanswered === 1 ? '' : 's'} remaining unanswered
      </Text>
    </View>
  );
}

function NavItem({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.navItem, disabled && styles.disabled]}
    >
      {icon}
      <Text style={styles.navLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 56,
    gap: 2,
  },
  navLabel: { fontSize: 11, fontWeight: '600', color: colors.inkSecondary },
  disabled: { opacity: 0.4 },
  submit: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  submitText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  hint: {
    fontSize: 11,
    color: colors.inkMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
});
