import type { ReactNode } from 'react';

export type MascotMood =
  | 'welcome'
  | 'network'
  | 'scanner'
  | 'passkey'
  | 'id_check'
  | 'waiting'
  | 'ready'
  | 'answering'
  | 'navigating'
  | 'submitting'
  | 'success';

export interface TutorialBullet {
  text: string;
  highlight?: string;
}

export interface TutorialStep {
  id: number;
  stepNumber: string; // e.g. "STEP 01 OF 11"
  badge: string; // e.g. "ORIENTATION"
  title: string;
  subtitle: string;
  bullets: TutorialBullet[];
  proTip: string;
  mascotMood: MascotMood;
  actionHint: string;
  targetButtonLabel?: string;
  image?: any;
  imageSecondary?: any;
  imageLabel?: string;
  imageSecondaryLabel?: string;
}
