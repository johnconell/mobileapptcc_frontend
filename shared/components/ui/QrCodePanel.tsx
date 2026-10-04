import React from 'react';
import { Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { radii, shadows } from '@/shared/theme';
import { useAppTheme } from '@/shared/hooks/useAppTheme';

interface QrCodePanelProps {
  value: string;
  size?: number;
  note?: string | null;
  /** Render the built-in white frame. Set false when the caller owns the frame (proctor lobby). */
  frame?: boolean;
}

export function QrCodePanel({
  value,
  size,
  note = 'Students must scan this QR Code to join the examination.',
  frame = true,
}: QrCodePanelProps) {
  const { width } = useWindowDimensions();
  const { colors: themeColors, isDark } = useAppTheme();
  const qrSize = size ?? Math.min(220, Math.max(160, width - 120));

  // react-native-qrcode-svg throws if value is empty or not a string.
  // Guard: fall back to a placeholder so the component never crashes.
  const safeValue = typeof value === 'string' && value.trim().length > 0 ? value : '----';

  const code = (
    <QRCode
      value={safeValue}
      size={qrSize}
      ecl="L"
      quietZone={8}
      color="#000000"
      backgroundColor="#FFFFFF"
    />
  );

  return (
    <View style={styles.wrap}>
      {frame ? (
        <View style={[styles.frame, { borderColor: isDark ? '#333333' : themeColors.cardBorder }]}>
          {code}
        </View>
      ) : (
        code
      )}
      {note ? <Text style={[styles.note, { color: themeColors.textSecondary }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14, width: '100%' },
  frame: {
    padding: 18,
    borderRadius: radii.card,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
    ...shadows.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: '#A1A1AA',
    textAlign: 'center',
    maxWidth: 280,
    fontWeight: '500',
  },
});