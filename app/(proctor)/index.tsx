import React from 'react';
import { Redirect } from 'expo-router';
import { useProctorStore } from '@/stores';

export default function ProctorIndex() {
  const profile = useProctorStore((s) => s.profile);
  if (!profile) {
    return <Redirect href="/" />;
  }
  return <Redirect href="/(proctor)/dashboard" />;
}
