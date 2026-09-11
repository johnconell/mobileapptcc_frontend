/**
 * Feature: schedules
 * Screen: app/(proctor)/(tabs)/examination.tsx
 */
export { ScheduleRepository } from '@/features/schedules/repositories/ScheduleRepository';
export { ScheduleCard } from '@/features/schedules/components/ScheduleCard';
export {
  deriveExamSlotStatus,
  matchOpenedRoom,
  summarizeScheduleStatus,
  EXAM_STATUS_LABELS,
} from '@/features/schedules/utils/examScheduleStatus';
