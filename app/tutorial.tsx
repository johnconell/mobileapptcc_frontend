import React from 'react';
import { useRouter } from 'expo-router';
import { ApplicantExamTutorial } from '@/features/tutorial/components/ApplicantExamTutorial';

export default function TutorialScreen() {
  const router = useRouter();

  const handleDismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleComplete = () => {
    router.replace('/(student)/scan');
  };

  return (
    <ApplicantExamTutorial
      onDismiss={handleDismiss}
      onComplete={handleComplete}
    />
  );
}
