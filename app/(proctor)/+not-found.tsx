import { Redirect } from 'expo-router';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';

/** After logout a stale tab URL should return to the public landing page. */
export default function ProctorUnmatchedRoute() {
  const profile = useProctorStore((s) => s.profile);
  if (!profile) {
    return <Redirect href={{ pathname: '/', params: { stay: '1', from: 'logout' } }} />;
  }
  return <Redirect href="/(proctor)/(tabs)/dashboard" />;
}
