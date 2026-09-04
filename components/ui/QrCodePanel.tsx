import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, radii, shadows } from '@/theme';

interface QrCodePanelProps {
  value: string;
  size?: number;
  note?: string;
}

export function QrCodePanel({
  value,
  size = 220,
  note = 'Students must scan this QR Code to join the examination.',
}: QrCodePanelProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        <QRCode
          value={value}
          size={size}
          ecl="L"
          quietZone={8}
          color={colors.ink}
          backgroundColor={colors.white}
        />
      </View>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  frame: {
    padding: 18,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSecondary,
    textAlign: 'center',
    maxWidth: 280,
    fontWeight: '500',
  },
});
