import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useExamProcess } from '@/shared/theme/examProcess';

/** Legacy route: QR + code are merged on `/(student)/scan`. */
export default function EnterCodeRedirectScreen() {
  const router = useRouter();
  const tokens = useExamProcess();

  useEffect(() => {
    router.replace('/(student)/scan?mode=code');
  }, [router]);

  return (
    <View style={[styles.screen, { backgroundColor: tokens.pageBg }]}>
      <ActivityIndicator color={tokens.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
