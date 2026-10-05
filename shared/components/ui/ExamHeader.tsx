import React, { memo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Moon, RotateCcw, Settings, Sun, X } from 'lucide-react-native';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  useFontScale,
  useFontScaleActions,
  useThemeTokens,
} from '@/shared/contexts/ThemeContext';
import { TimerCard } from './TimerCard';
import type { CategoryItem } from './CategoryDropdown';
import { Row } from './primitives';

export interface ExamHeaderProps {
  remainingSeconds: number;
  totalDurationSeconds?: number;
  categories?: CategoryItem[];
  selectedCategory?: string | null;
  onSelectCategory?: (key: string | null) => void;
  disabled?: boolean;
}

function ExamHeaderComponent({
  remainingSeconds,
  totalDurationSeconds = 3600,
  disabled = false,
}: ExamHeaderProps) {
  const { theme, isDark, toggleTheme } = useThemeTokens();
  const fontScale = useFontScale();
  const { stepFontScale, setFontScale } = useFontScaleActions();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isAtMin = fontScale <= FONT_SCALE_MIN + 0.01;
  const isAtMax = fontScale >= FONT_SCALE_MAX - 0.01;
  const isDefault = Math.abs(fontScale - 1.0) < 0.02;

  return (
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: theme.surface,
          borderBottomColor: theme.divider,
        },
      ]}
    >
      {/* Row 1: Title + Subtitle on left; Sun/Moon toggle + Settings icon on right */}
      <Row style={styles.row1}>
        <View style={styles.titleColumn}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.mainTitle, { color: theme.text }]}>
            Final Examination
          </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.subTitle, { color: theme.textMuted }]}>
            College Entrance Test
          </Text>
        </View>

        {/* Top-Right Action Controls: Sun/Moon toggle + Settings */}
        <View style={styles.topActionsRow}>
          {/* Theme Toggle: Sun for Light mode, Moon for Dark mode */}
          <Pressable
            onPress={toggleTheme}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
                opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
          >
            {isDark ? (
              <Moon size={20} color={theme.accentText} strokeWidth={2.2} />
            ) : (
              <Sun size={20} color={theme.accentText} strokeWidth={2.2} />
            )}
          </Pressable>

          {/* Settings Menu Button */}
          <Pressable
            onPress={() => setSettingsOpen(true)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Open examination settings"
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
                opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Settings size={20} color={theme.textSecondary} strokeWidth={2.2} />
          </Pressable>
        </View>
      </Row>

      {/* Row 2: Timer Card (full width, centered) */}
      <View style={styles.timerWrapper}>
        <TimerCard
          remainingSeconds={remainingSeconds}
          totalDurationSeconds={totalDurationSeconds}
        />
      </View>

      {/* Settings Modal (Font Size Controls) */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { backgroundColor: `${isDark ? theme.bg : theme.text}73` },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsOpen(false)}
            accessibilityLabel="Dismiss settings"
          />

          <View
            style={[
              styles.settingsCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <Settings size={18} color={theme.accentText} strokeWidth={2.2} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  Settings
                </Text>
              </View>

              <Pressable
                onPress={() => setSettingsOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                hitSlop={8}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <X size={16} color={theme.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            {/* Font Size Section */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Question Font Size
                </Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                  Adjust text size for questions and answer choices
                </Text>
              </View>

              {/* Font Adjustment Controls */}
              <View style={styles.stepperContainer}>
                {/* Stepper with A- / % / A+ */}
                <View
                  style={[
                    styles.stepperBox,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => stepFontScale(-FONT_SCALE_STEP)}
                    disabled={isAtMin}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease font size"
                    style={[
                      styles.stepperButton,
                      isAtMin && styles.stepperButtonDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepperLabel,
                        {
                          color: isAtMin ? theme.textMuted : theme.accentText,
                          fontSize: 14,
                        },
                      ]}
                    >
                      A-
                    </Text>
                  </Pressable>

                  <View
                    style={[
                      styles.stepperValueBox,
                      {
                        borderLeftColor: theme.border,
                        borderRightColor: theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.stepperValueText, { color: theme.text }]}>
                      {`${Math.round(fontScale * 100)}%`}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => stepFontScale(FONT_SCALE_STEP)}
                    disabled={isAtMax}
                    accessibilityRole="button"
                    accessibilityLabel="Increase font size"
                    style={[
                      styles.stepperButton,
                      isAtMax && styles.stepperButtonDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepperLabel,
                        {
                          color: isAtMax ? theme.textMuted : theme.accentText,
                          fontSize: 16,
                        },
                      ]}
                    >
                      A+
                    </Text>
                  </Pressable>
                </View>

                {/* Reset to 100% button */}
                <Pressable
                  onPress={() => setFontScale(1.0)}
                  disabled={isDefault}
                  accessibilityRole="button"
                  accessibilityLabel="Reset font size to default 100%"
                  style={[
                    styles.resetButton,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.border,
                      opacity: isDefault ? 0.45 : 1,
                    },
                  ]}
                >
                  <RotateCcw
                    size={14}
                    color={isDefault ? theme.textMuted : theme.textSecondary}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.resetText,
                      {
                        color: isDefault ? theme.textMuted : theme.textSecondary,
                      },
                    ]}
                  >
                    Reset
                  </Text>
                </Pressable>
              </View>

              {/* Dynamic Sample Preview */}
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.previewLabel,
                    { color: theme.textMuted },
                  ]}
                >
                  Live Preview:
                </Text>
                <Text
                  style={[
                    styles.previewText,
                    {
                      color: theme.text,
                      fontSize: 14 * fontScale,
                      lineHeight: Math.round(20 * fontScale),
                    },
                  ]}
                >
                  The quick brown fox jumps over the lazy dog.
                </Text>
              </View>
            </View>

            {/* Done Button */}
            <Pressable
              onPress={() => setSettingsOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={[
                styles.doneButton,
                {
                  backgroundColor: theme.accent,
                  borderColor: theme.accent,
                },
              ]}
            >
              <Text style={[styles.doneButtonText, { color: theme.onAccent }]}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const ExamHeader = memo(ExamHeaderComponent);

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
  },
  mainTitle: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 20,
  },
  subTitle: {
    fontSize: 12,
    marginTop: 2,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerWrapper: {
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  settingsCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlock: {
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBox: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperLabel: {
    fontWeight: '600',
  },
  stepperValueBox: {
    minWidth: 64,
    height: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  stepperValueText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resetButton: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewText: {
    fontSize: 14,
  },
  doneButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
