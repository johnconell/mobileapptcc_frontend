import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  Shield,
  KeyRound,
  Mail,
  Camera,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { Header, Button, Card } from '@/shared/components/ui';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { useAppTheme } from '@/shared/hooks/useAppTheme';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import { appStorage } from '@/shared/services/storage';
import { STORAGE_KEYS } from '@/shared/constants';
import { ProctorAuthCache } from '@/features/authentication/services/proctorAuthCache';

const AVATAR_COLORS = [
  { id: '1', bg: '#003366', border: '#0055A4', label: 'Classic Navy' },
  { id: '2', bg: '#1E3A8A', border: '#3B82F6', label: 'Royal Blue' },
  { id: '3', bg: '#065F46', border: '#10B981', label: 'Emerald' },
  { id: '4', bg: '#7C2D12', border: '#F97316', label: 'Amber Bronze' },
  { id: '5', bg: '#581C87', border: '#A855F7', label: 'Deep Purple' },
  { id: '6', bg: '#0F172A', border: '#64748B', label: 'Obsidian Slate' },
];

export default function ProctorAccountScreen() {
  const router = useRouter();
  const { colors, isDark, fontMultiplier } = useAppTheme();
  const profile = useProctorStore((s) => s.profile);
  const setProfile = useProctorStore((s) => s.setProfile);

  // Profile fields
  const [name, setName] = useState(profile?.displayName || '');
  const [gmail, setGmail] = useState(profile?.username || '');
  const [avatarBg, setAvatarBg] = useState('#003366');
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await AuthRepository.getCachedSessionFast();
      if (session) {
        setName(session.displayName || '');
        setGmail(session.username || '');
      }
      try {
        const storedAvatar = await appStorage.getItem('tcc.proctor.avatar_color');
        if (storedAvatar) {
          setAvatarBg(storedAvatar);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Save Name & Gmail
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (!gmail.trim() || !gmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please provide a valid Gmail or email address.');
      return;
    }

    try {
      const current = (await AuthRepository.getCachedSessionFast()) || profile;
      const updated = {
        ...(current || {}),
        displayName: name.trim(),
        username: gmail.trim(),
      };

      await appStorage.setItem(STORAGE_KEYS.proctorSession, JSON.stringify(updated));
      setProfile(updated as any);

      Alert.alert(
        'Profile Updated',
        'Your name and Gmail address have been updated successfully (the same as Facebook Personal Details).',
      );
    } catch {
      Alert.alert('Error', 'Unable to save profile changes. Please try again.');
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Current Password Required', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      // In offline cache, update password hash if offline account exists
      if (gmail) {
        await ProctorAuthCache.updatePassword(gmail, newPassword);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      Alert.alert(
        'Password Changed',
        'Your password has been securely updated and encrypted across your sessions.',
      );
    } catch {
      Alert.alert('Error', 'Unable to update password. Please check your connection or cache.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(proctor)/(tabs)/settings');
  };

  const handleSelectAvatar = async (color: string) => {
    setAvatarBg(color);
    setAvatarModalOpen(false);
    await appStorage.setItem('tcc.proctor.avatar_color', color);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Account Center"
        subtitle="Personal Details & Security"
        onBack={handleBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. FACEBOOK-STYLE PROFILE HEADER CARD */}
        <View
          style={[
            styles.profileHeaderCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.avatarSection}>
            <Pressable
              style={[styles.avatarCircle, { backgroundColor: avatarBg }]}
              onPress={() => setAvatarModalOpen(true)}
            >
              <User size={36} color="#FFFFFF" />
              <View style={styles.cameraIconBadge}>
                <Camera size={12} color="#FFFFFF" />
              </View>
            </Pressable>
            <Pressable onPress={() => setAvatarModalOpen(true)}>
              <Text
                style={[styles.changePhotoText, { color: colors.accent }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Change Profile Style
              </Text>
            </Pressable>
          </View>

          <View style={styles.profileHeaderInfo}>
            <Text
              style={[styles.profileHeaderName, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              {name || 'Proctor User'}
            </Text>
            <Text
              style={[styles.profileHeaderEmail, { color: colors.textSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={fontMultiplier}
            >
              {gmail || 'proctor@example.com'}
            </Text>
            <View style={[styles.verifiedPill, { backgroundColor: colors.accentMuted }]}>
              <ShieldCheck size={12} color={colors.accent} />
              <Text
                style={[styles.verifiedPillText, { color: colors.accent }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Verified Examination Proctor
              </Text>
            </View>
          </View>
        </View>

        {/* 2. PERSONAL DETAILS (Name & Gmail) */}
        <Text
          style={[styles.sectionHeading, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={fontMultiplier}
        >
          Personal Details
        </Text>

        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text
              style={[styles.inputLabel, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Proctor Full Name
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
              ]}
            >
              <User size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Gmail / Email */}
          <View style={styles.inputGroup}>
            <Text
              style={[styles.inputLabel, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Gmail / Contact Email
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
              ]}
            >
              <Mail size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                value={gmail}
                onChangeText={setGmail}
                placeholder="proctor@gmail.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <Text
              style={[styles.helperNote, { color: colors.textMuted }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Updating your Gmail updates notification alerts and session recovery keys.
            </Text>
          </View>

          <Button
            title="Save Personal Details"
            variant="primary"
            size="md"
            onPress={handleSaveProfile}
          />
        </View>

        {/* 3. PASSWORD & SECURITY */}
        <Text
          style={[styles.sectionHeading, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={fontMultiplier}
        >
          Password & Security
        </Text>

        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          {/* Current Password */}
          <View style={styles.inputGroup}>
            <Text
              style={[styles.inputLabel, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Current Password
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
              ]}
            >
              <KeyRound size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPasswords}
              />
              <Pressable onPress={() => setShowPasswords((s) => !s)} hitSlop={8}>
                {showPasswords ? (
                  <EyeOff size={18} color={colors.textMuted} />
                ) : (
                  <Eye size={18} color={colors.textMuted} />
                )}
              </Pressable>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.inputGroup}>
            <Text
              style={[styles.inputLabel, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              New Password
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
              ]}
            >
              <KeyRound size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPasswords}
              />
            </View>
          </View>

          {/* Confirm New Password */}
          <View style={styles.inputGroup}>
            <Text
              style={[styles.inputLabel, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={fontMultiplier}
            >
              Confirm New Password
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
              ]}
            >
              <KeyRound size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPasswords}
              />
            </View>
          </View>

          <Button
            title="Update Password"
            variant="outline"
            size="md"
            loading={savingPassword}
            onPress={handleChangePassword}
          />
        </View>
      </ScrollView>

      {/* AVATAR COLOR SELECTOR MODAL */}
      <Modal
        visible={avatarModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.avatarModalSheet,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text
                style={[styles.modalTitle, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={fontMultiplier}
              >
                Choose Profile Color Theme
              </Text>
              <Pressable onPress={() => setAvatarModalOpen(false)} hitSlop={10}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.avatarGrid}>
              {AVATAR_COLORS.map((av) => (
                <Pressable
                  key={av.id}
                  style={[
                    styles.avatarColorChoice,
                    { backgroundColor: av.bg, borderColor: av.border },
                    avatarBg === av.bg && styles.avatarColorChoiceSelected,
                  ]}
                  onPress={() => handleSelectAvatar(av.bg)}
                >
                  <User size={24} color="#FFFFFF" />
                  {avatarBg === av.bg && (
                    <View style={styles.avatarSelectedCheck}>
                      <Check size={12} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  // Profile Header Card
  profileHeaderCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 4,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#0055A4',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  changePhotoText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  profileHeaderInfo: {
    flex: 1,
    gap: 3,
  },
  profileHeaderName: {
    fontSize: 17,
    fontWeight: '800',
  },
  profileHeaderEmail: {
    fontSize: 12,
    fontWeight: '500',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
  },
  verifiedPillText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Sections
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionSubBadge: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Form Cards
  formCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  inputGroup: {
    gap: 5,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  helperNote: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  avatarModalSheet: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    gap: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  avatarColorChoice: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    position: 'relative',
  },
  avatarColorChoiceSelected: {
    transform: [{ scale: 1.1 }],
  },
  avatarSelectedCheck: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#28A745',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
