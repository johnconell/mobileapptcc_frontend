import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Button, Card } from '@/components/ui';
import { colors } from '@/theme';

type Props = {
  title?: string;
  message: string;
  checking?: boolean;
  onRetry: () => void;
};

export function CampusWifiBlockedCard({
  title = 'Campus Wi‑Fi required',
  message,
  checking = false,
  onRetry,
}: Props) {
  return (
    <Card>
      <View style={styles.iconWrap}>
        <WifiOff size={28} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
      <Button
        title={checking ? 'Checking…' : 'Check Wi‑Fi again'}
        fullWidth
        loading={checking}
        onPress={onRetry}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.inkSecondary,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
});
