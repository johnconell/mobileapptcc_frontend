import React from 'react';
import { usePracticeStore } from '@/features/practice/practiceStore';
import { PracticeWaitingRoom } from '@/app/(student)/lobby';

export default function PracticeLobbyRoute() {
  const applicant = usePracticeStore((state) => state.applicant);
  return <PracticeWaitingRoom applicant={applicant} />;
}
