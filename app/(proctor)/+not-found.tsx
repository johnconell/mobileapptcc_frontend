import { Redirect } from 'expo-router';
import { useProctorStore } from '@/stores';

/** After logout the URL can still be a tab route; send the user to Login or Dashboard. */
export default function ProctorUnmatchedRoute() {
  const profile = useProctorStore((s) => s.profile);
  if (!profile) {
    return <Redirect href="/(proctor)/login" />;
  }
  return <Redirect href="/(proctor)/dashboard" />;
}
