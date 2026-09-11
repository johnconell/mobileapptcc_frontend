/**
 * Feature: applicants (mobile examinees)
 * Routes stay in app/(student)/* — do not move them.
 */
export { StudentRepository } from '@/repositories/StudentRepository';
export { useStudentStore } from '@/stores/studentStore';
export { clearApplicantExamMaterial } from '@/services/applicantExamCleanup';
