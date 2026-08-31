import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Alert, Pressable } from 'react-native';
import { Header } from '@/components/ui/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useRouter } from 'expo-router';
import { Menu } from 'lucide-react-native';
import { useProctorDrawer } from './ProctorDrawer';
import { AuthRepository } from '@/repositories';
import { appStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';
import { colors } from '@/theme';
import { VersionInfo } from '@/components/VersionInfo';

export default function AccountScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    void (async () => {
      const session = await AuthRepository.getSession();
      setProfile(session);
      setName(session?.displayName ?? '');
      setEmail(session?.username ?? (session as any)?.email ?? '');
    })();
  }, []);

  const save = async () => {
    if (!profile) return;
    const updated = { ...profile, displayName: name, username: email };
    try {
      await appStorage.setItem(STORAGE_KEYS.proctorSession, JSON.stringify(updated));
      Alert.alert('Saved', 'Profile updated locally. Server-side changes require administrator action.');
      setProfile(updated);
    } catch (e) {
      Alert.alert('Unable to save', 'Try again.');
    }
  };

  const { toggleDrawer } = useProctorDrawer();

  return (
    <View style={styles.screen}>
      <Header
        title="Account Settings"
        subtitle="Manage your proctor account"
        left={
            <Pressable onPress={toggleDrawer} style={styles.menuBtn}>
                <Menu size={24} color={colors.ink} />
            </Pressable>
        }
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        <Card>
          <Input label="Full name" value={name} onChangeText={setName} />
          <View style={{ height: 12 }} />
          <Input label="Gmail / Email" value={email} onChangeText={setEmail} />
          <View style={{ height: 12 }} />
          <Button title="Save" onPress={save} />
          <View style={{ height: 12 }} />
          <Button
            title="Change password"
            variant="outline"
            onPress={() => Alert.alert('Change Password', 'Password changes require administrator support. Reset via Admin portal.')}
          />
        </Card>

        <VersionInfo />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12 },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
