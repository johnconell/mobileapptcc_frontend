/**
 * Feature: examinations (LAN + questions + security)
 * Screens: app/(student)/exam.tsx, app/(proctor)/room.tsx
 */
export { QuestionRepository } from '@/features/examinations/repositories/QuestionRepository';
export { SecurityRepository } from '@/features/examinations/repositories/SecurityRepository';
export { useExamStore } from '@/features/examinations/stores/examStore';
export { PeerExamServer } from '@/features/examinations/services/peerExamServer';
export { PeerExamClient } from '@/features/examinations/services/peerExamClient';
export { ExamLifecycle } from '@/features/examinations/services/examLifecycle';
export { mapServerToAuthority } from '@/features/examinations/services/examAuthority';
export * from '@/features/examinations/services/examStartCoordinator';
export { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
export { useExamSecurity } from '@/features/examinations/hooks/useExamSecurity';
export { useKioskMode } from '@/features/examinations/hooks/useKioskMode';
export { useExamTimer } from '@/features/examinations/hooks/useExamTimer';
export { useViolationMonitor } from '@/features/monitoring/hooks/useViolationMonitor';
export { ExamWifiDisconnectOverlay } from '@/features/examinations/components/ExamWifiDisconnectOverlay';
export {
  ExamProcessChrome,
  ExamProcessActions,
  ExamProcessButton,
  ExamProcessOk,
} from '@/features/examinations/components/ExamProcessChrome';
export {
  ExamCategoryNav,
  buildCategoryProgress,
} from '@/features/examinations/components/ExamCategoryNav';
