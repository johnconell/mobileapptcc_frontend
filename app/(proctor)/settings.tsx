import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  Shield,
  Moon,
  Sun,
  Laptop,
  Smartphone,
  ChevronRight,
  Sparkles,
  Type,
  Check,
  X,
  History,
} from 'lucide-react-native';
import { Header, Button } from '@/components/ui';
import { useProctorStore } from '@/stores';
import { useAppTheme } from '@/hooks/useAppTheme';
import { AuthRepository } from '@/repositories';
import { VersionInfo } from '@/components/VersionInfo';
import type { ThemeMode, AppFontSize } from '@/stores/settingsStore';

export default function ProctorSettingsScreen() {
  const router = useRouter();
  const profile = useProctorStore((s) => s.profile);
  const reset = useProctorStore((s) => s.reset);
  const { colors, isDark, themeMode, fontSize, setThemeMode, setFontSize, fontMultiplier } =
    useAppTheme();

  const [appearanceModalOpen, setAppearanceModalOpen] = useState(false);

  const doLogout = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out and return to the main landing page?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await AuthRepository.logout();
            reset();
            router.replace({ pathname: '/', params: { stay: '1', from: 'logout' } } as any);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Settings & Profile"
        subtitle="Proctor Configuration & Security"
        hideBackSlot
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* PROFILE CARD */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={[styles.avatarCircle, { backgroundColor: colors.tabBarActive }]}>
            <User size={30} color="#FFFFFF" />
          </View>
          <View style={styles.profileInfo}>
            <Text
              style={[styles.profileName, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              {profile?.displayName || profile?.username || 'Proctor User'}
            </Text>
            <Text
              style={[styles.profileEmail, { color: colors.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              {profile?.username || 'proctor@example.com'}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: colors.accentMuted }]}>
              <Text
                style={[styles.roleBadgeText, { color: colors.accent }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Authorized Proctor
              </Text>
            </View>
          </View>
        </View>

        {/* ACCOUNT & SECURITY */}
        <Text
          style={[styles.groupHeading, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={fontMultiplier}
        >
          Account & Security
        </Text>

        <View
          style={[
            styles.menuCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          {/* Account Settings */}
          <Pressable
            style={styles.menuItem}
            onPress={() =>
              router.push({
                pathname: '/(proctor)/account',
                params: { from: 'settings' },
              } as any)
            }
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.accentMuted }]}>
              <Shield size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.menuTitle, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Account Settings
              </Text>
              <Text
                style={[styles.menuSub, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Personal details, password & login activity
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* SYSTEM & ACCESSIBILITY */}
        <Text
          style={[styles.groupHeading, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={fontMultiplier}
        >
          System & Accessibility
        </Text>

        <View
          style={[
            styles.menuCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          {/* Appearance & Theme (Functional Modal) */}
          <Pressable style={styles.menuItem} onPress={() => setAppearanceModalOpen(true)}>
            <View style={[styles.menuIcon, { backgroundColor: colors.warningMuted }]}>
              {isDark ? (
                <Moon size={18} color={colors.warning} />
              ) : (
                <Sun size={18} color={colors.warning} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.menuTitle, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Appearance & Theme
              </Text>
              <Text
                style={[styles.menuSub, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                {themeMode === 'dark' ? 'Dark Mode' : themeMode === 'light' ? 'Light Mode' : 'System Auto'} · Font: {fontSize}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* LOGOUT BUTTON */}
        <Button
          title="Sign Out"
          variant="outline"
          size="lg"
          fullWidth
          style={{ borderColor: colors.danger, marginTop: 10 }}
          onPress={doLogout}
        />

        <View style={{ marginTop: 20 }}>
          <VersionInfo />
        </View>
      </ScrollView>

      {/* FUNCTIONAL APPEARANCE & THEME MODAL */}
      <Modal
        visible={appearanceModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAppearanceModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Sparkles size={20} color={colors.accent} />
                <Text
                  style={[styles.modalTitle, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Appearance & Display
                </Text>
              </View>
              <Pressable onPress={() => setAppearanceModalOpen(false)} hitSlop={10}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* THEME MODE SELECTOR */}
            <Text
              style={[styles.modalSectionTitle, { color: colors.textPrimary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Theme Mode
            </Text>
            <View style={styles.optionsRow}>
              {/* Light Mode */}
              <Pressable
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                  themeMode === 'light' && {
                    borderColor: colors.accent,
                    backgroundColor: colors.accentMuted,
                  },
                ]}
                onPress={() => setThemeMode('light')}
              >
                <Sun size={20} color={themeMode === 'light' ? colors.accent : colors.textMuted} />
                <Text
                  style={[
                    styles.optionText,
                    { color: themeMode === 'light' ? colors.accent : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Light Mode
                </Text>
                {themeMode === 'light' && (
                  <Check size={14} color={colors.accent} style={styles.optionCheck} />
                )}
              </Pressable>

              {/* Dark Mode */}
              <Pressable
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                  themeMode === 'dark' && {
                    borderColor: colors.accent,
                    backgroundColor: colors.accentMuted,
                  },
                ]}
                onPress={() => setThemeMode('dark')}
              >
                <Moon size={20} color={themeMode === 'dark' ? colors.accent : colors.textMuted} />
                <Text
                  style={[
                    styles.optionText,
                    { color: themeMode === 'dark' ? colors.accent : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Dark Mode
                </Text>
                {themeMode === 'dark' && (
                  <Check size={14} color={colors.accent} style={styles.optionCheck} />
                )}
              </Pressable>

              {/* System Auto */}
              <Pressable
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                  themeMode === 'system' && {
                    borderColor: colors.accent,
                    backgroundColor: colors.accentMuted,
                  },
                ]}
                onPress={() => setThemeMode('system')}
              >
                <Laptop size={20} color={themeMode === 'system' ? colors.accent : colors.textMuted} />
                <Text
                  style={[
                    styles.optionText,
                    { color: themeMode === 'system' ? colors.accent : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  System
                </Text>
                {themeMode === 'system' && (
                  <Check size={14} color={colors.accent} style={styles.optionCheck} />
                )}
              </Pressable>
            </View>

            {/* FONT SIZE SELECTOR */}
            <Text
              style={[styles.modalSectionTitle, { color: colors.textPrimary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Text & Font Size
            </Text>
            <View style={styles.optionsRow}>
              {/* Small */}
              <Pressable
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                  fontSize === 'small' && {
                    borderColor: colors.accent,
                    backgroundColor: colors.accentMuted,
                  },
                ]}
                onPress={() => setFontSize('small')}
              >
                <Type size={16} color={fontSize === 'small' ? colors.accent : colors.textMuted} />
                <Text
                  style={[
                    styles.optionText,
                    { color: fontSize === 'small' ? colors.accent : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Small
                </Text>
              </Pressable>

              {/* Standard */}
              <Pressable
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                  fontSize === 'standard' && {
                    borderColor: colors.accent,
                    backgroundColor: colors.accentMuted,
                  },
                ]}
                onPress={() => setFontSize('standard')}
              >
                <Type size={19} color={fontSize === 'standard' ? colors.accent : colors.textMuted} />
                <Text
                  style={[
                    styles.optionText,
                    { color: fontSize === 'standard' ? colors.accent : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Standard
                </Text>
              </Pressable>

              {/* Large */}
              <Pressable
                style={[
                  styles.optionBtn,
                  { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
                  fontSize === 'large' && {
                    borderColor: colors.accent,
                    backgroundColor: colors.accentMuted,
                  },
                ]}
                onPress={() => setFontSize('large')}
              >
                <Type size={23} color={fontSize === 'large' ? colors.accent : colors.textMuted} />
                <Text
                  style={[
                    styles.optionText,
                    { color: fontSize === 'large' ? colors.accent : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={fontMultiplier}
                >
                  Large
                </Text>
              </Pressable>
            </View>

            {/* LIVE PREVIEW BOX */}
            <View
              style={[
                styles.previewBox,
                { backgroundColor: colors.cardMuted, borderColor: colors.cardBorder },
              ]}
            >
              <Text
                style={[
                  styles.previewLabel,
                  { color: colors.textSecondary, fontSize: 13 * fontMultiplier },
                ]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Live Preview:
              </Text>
              <Text
                style={[
                  styles.previewHeadline,
                  { color: colors.textPrimary, fontSize: 16 * fontMultiplier },
                ]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Entrance Examination · Passing Grade: 75.0%
              </Text>
              <Text
                style={[
                  styles.previewBody,
                  { color: colors.textSecondary, fontSize: 12 * fontMultiplier },
                ]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                All cards, borders, and text are high-contrast and fully legible in dark and light modes.
              </Text>
            </View>

            <Button
              title="Apply & Close"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setAppearanceModalOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  profileCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 16, fontWeight: '800' },
  profileEmail: { fontSize: 12, fontWeight: '500' },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },

  groupHeading: { fontSize: 15, fontWeight: '800', marginTop: 4, marginBottom: -6 },
  menuCard: {
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: { fontSize: 14, fontWeight: '700' },
  menuSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  separator: { height: 1, marginHorizontal: 14 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    gap: 14,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  optionCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },

  // Preview Box
  previewBox: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 6,
    marginVertical: 4,
  },
  previewLabel: {
    fontWeight: '700',
  },
  previewHeadline: {
    fontWeight: '800',
  },
  previewBody: {
    lineHeight: 18,
    fontWeight: '500',
  },
});
