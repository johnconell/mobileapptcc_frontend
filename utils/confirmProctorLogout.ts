import { Alert } from 'react-native';
import { router } from 'expo-router';
import { AuthRepository } from '@/repositories';
import { useProctorStore } from '@/stores';

/**
 * Logs out the proctor account only. Does not end/close the exam session.
 * Replaces to Login (a real stack screen) so hardware back can pop to Landing.
 */
export function confirmProctorLogout() {
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
            try {
              await AuthRepository.logout();
            } catch (err) {
              console.warn('[PROCTOR] Logout failed:', err);
            } finally {
              useProctorStore.getState().reset();
              router.replace('/(proctor)/login');
            }
          })();
        },
      },
    ],
  );
}
