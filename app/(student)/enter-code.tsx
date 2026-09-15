import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { examProcess } from '@/shared/theme/examProcess';

/** Legacy route: QR + code are merged on `/(student)/scan`. */
export default function EnterCodeRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(student)/scan?mode=code');
  }, [router]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={examProcess.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: examProcess.pageBg,
  },
});
