import React from 'react';
import { Redirect } from 'expo-router';
import { useProctorStore } from '@/features/proctors/stores/proctorStore';

export default function ProctorIndex() {
  const profile = useProctorStore((s) => s.profile);
  if (!profile) {
    return <Redirect href="/(proctor)/login" />;
  }
  return <Redirect href="/(proctor)/dashboard" />;
}
