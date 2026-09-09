import { Alert } from 'react-native';
import type { Router } from 'expo-router';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';

/**
 * Logs out the proctor account only. Does not end/close the exam session.
 */
export function confirmProctorLogout(router: Router) {
  Alert.alert(
    'Are you sure you want to log out?',
    'Your account will sign out. The examination stays running — students and answers are not affected.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Logout',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await AuthRepository.logout();
            useProctorStore.getState().reset();
            router.replace({ pathname: '/', params: { stay: '1', from: 'logout' } } as any);
          })();
        },
      },
    ],
  );
}
