import React, { useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Keyboard, QrCode, Shield } from 'lucide-react-native';
import { APP_NAME, SCHOOL_NAME } from '@/constants';
import { colors, shadows } from '@/theme';
import {
  Card,
  FloatingButton,
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonText,
} from '@/components/ui';
import { SchoolLogo } from '@/features/student/SchoolLogo';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [joinOpen, setJoinOpen] = useState(false);
  const [preparing] = useState(false);

  // No Wi‑Fi / Hub check here — students open the scanner first.
  // Network matching is validated only AFTER a QR is scanned (or a code is submitted).
  const startTakeExam = () => {
    setJoinOpen(true);
  };

  if (preparing) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.prepareSkeleton}>
          <SkeletonCircle size={96} />
          <Skeleton height={26} width="70%" />
          <Skeleton height={12} width="85%" />
          <SkeletonCard>
            <Skeleton height={16} width="55%" />
            <SkeletonText lines={2} />
            <Skeleton height={52} radius={14} />
          </SkeletonCard>
          <Text style={styles.prepareNote}>
            Preparing exam content on this phone…
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Proctor portal"
          onPress={() => router.push('/(proctor)/login')}
          style={styles.proctorBtn}
        >
          <Shield size={14} color={colors.primary} />
          <Text style={styles.proctorText}>Proctor</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.hero}>
          <SchoolLogo size="lg" />
          <Text style={styles.school}>{SCHOOL_NAME}</Text>
          <Text style={styles.appName}>{APP_NAME}</Text>
          <Text style={styles.tagline}>Secure Offline Examination</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Card>
            <Text style={styles.cardTitle}>Ready to begin?</Text>
            <Text style={styles.cardBody}>
              Connect to the campus exam Wi‑Fi first. Then tap Take Examination to
              update this phone’s exam cache and join by QR or code. Mobile data
              alone is not allowed.
            </Text>
          </Card>
        </Animated.View>
      </View>

      <View style={[styles.fabWrap, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <FloatingButton
          label="Take Examination"
          icon={<QrCode size={20} color={colors.white} />}
          onPress={() => void startTakeExam()}
          style={styles.fab}
        />
      </View>

      <Modal
        transparent
        visible={joinOpen}
        animationType="fade"
        onRequestClose={() => setJoinOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setJoinOpen(false)} />
          <Animated.View entering={FadeInDown.springify()} style={styles.sheet}>
            <Text style={styles.sheetTitle}>Join Examination</Text>
            <Text style={styles.sheetSub}>
              Choose how you want to enter the examination lobby.
            </Text>

            <Pressable
              style={styles.option}
              onPress={() => {
                setJoinOpen(false);
                router.push('/(student)/scan');
              }}
            >
              <View style={styles.optionIcon}>
                <QrCode size={22} color={colors.primary} />
              </View>
              <View style={styles.optionMeta}>
                <Text style={styles.optionTitle}>Scan QR Code</Text>
                <Text style={styles.optionBody}>Use your camera to scan the proctor QR.</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.option}
              onPress={() => {
                setJoinOpen(false);
                router.push('/(student)/enter-code');
              }}
            >
              <View style={styles.optionIcon}>
                <Keyboard size={22} color={colors.primary} />
              </View>
              <View style={styles.optionMeta}>
                <Text style={styles.optionTitle}>Enter Examination Code</Text>
                <Text style={styles.optionBody}>
                  For devices with damaged or unavailable cameras.
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={() => setJoinOpen(false)} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  proctorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  proctorText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  content: { flex: 1, paddingHorizontal: 20, gap: 20, justifyContent: 'center' },
  prepareSkeleton: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  prepareNote: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
    textAlign: 'center',
  },
  hero: { alignItems: 'center', gap: 8, paddingBottom: 8 },
  school: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primary,
    textAlign: 'center',
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  tagline: { fontSize: 14, color: colors.inkMuted, fontWeight: '500' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  cardBody: { fontSize: 14, lineHeight: 21, color: colors.inkSecondary },
  fabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fab: { width: '100%', maxWidth: 320 },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 12,
    ...shadows.card,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  sheetSub: { fontSize: 14, color: colors.inkSecondary, lineHeight: 20, marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0D9DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionMeta: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionBody: { fontSize: 12, color: colors.inkMuted, lineHeight: 18 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontWeight: '700', color: colors.primary },
});
