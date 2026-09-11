/**
 * Feature: schedules
 * Screen: app/(proctor)/(tabs)/examination.tsx
 */
export { ScheduleRepository } from '@/repositories/ScheduleRepository';
export { ScheduleCard } from '@/features/proctor/ScheduleCard';
export {
  deriveExamSlotStatus,
  matchOpenedRoom,
  summarizeScheduleStatus,
  EXAM_STATUS_LABELS,
} from '@/utils/examScheduleStatus';
