/**
 * Feature: authentication (proctor)
 * Routes stay in app/(proctor)/login.tsx — do not move them.
 */
export { AuthRepository } from '@/features/authentication/repositories/AuthRepository';
export { getProctorGoogleRedirectUrl, isProctorGoogleCallback, parseProctorGoogleCallback } from '@/features/authentication/services/proctorGoogleAuth';
export { ProctorAuthCache } from '@/features/authentication/services/proctorAuthCache';
export { confirmProctorLogout } from '@/features/authentication/utils/confirmProctorLogout';
