import { Alert } from 'react-native';
import { router } from 'expo-router';
import { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';
import { PeerExamServer } from '@/features/examinations/services/peerExamServer';
import { useLobbyStore } from '@/features/lobby/stores/lobbyStore';

/**
 * Requires the proctor to close or end any active room before logout.
 * Returns to the public landing page after the session is cleared.
 */
export function confirmProctorLogout() {
  const peerInfo = PeerExamServer.info();
  const lobbyStatus = useLobbyStore.getState().snapshot?.status;
  if (
    (peerInfo.code && peerInfo.status !== 'ended') ||
    (lobbyStatus && lobbyStatus !== 'ended')
  ) {
    Alert.alert(
      'Examination room is active',
      'End the examination or close the lobby before logging out. Your room and saved student progress are still available.',
      [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Open rooms', onPress: () => router.replace('/(proctor)/rooms') },
      ],
    );
    return;
  }
  Alert.alert(
    'Are you sure you want to log out?',
    'Your account will sign out. Saved examination data and unsynchronized results will remain on this device.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Logout',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await AuthRepository.logout();
              useProctorStore.getState().reset();
              router.replace({ pathname: '/', params: { stay: '1', from: 'logout' } });
            } catch (err) {
              console.warn('[PROCTOR] Logout failed:', err);
              Alert.alert('Unable to log out', err instanceof Error ? err.message : 'Please try again.');
            }
          })();
        },
      },
    ],
  );
}
