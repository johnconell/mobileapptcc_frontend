/**
 * Anti-cheat & exam hardening — single export surface for capstone documentation.
 * Implementation spans native plugins, examination hooks, and monitoring.
 */
export { useExamSecurity } from '@/features/examinations/hooks/useExamSecurity';
export { useKioskMode } from '@/features/examinations/hooks/useKioskMode';
export { ExamSecurityService } from '@/features/examinations/services/ExamSecurityService';
export { ExamSecurityOverlay } from '@/features/examinations/components/ExamSecurityOverlay';
export { useViolationMonitor } from '@/features/monitoring/hooks/useViolationMonitor';
export { useViolations } from '@/features/monitoring/hooks/useViolations';
export { useWifiExamGate } from '@/features/monitoring/hooks/useWifiExamGate';
