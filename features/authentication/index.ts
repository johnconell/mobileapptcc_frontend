/**
 * Feature: authentication (proctor)
 * Routes stay in app/(proctor)/login.tsx — do not move them.
 */
export { AuthRepository } from '@/repositories/AuthRepository';
export { getProctorGoogleRedirectUrl, isProctorGoogleCallback, parseProctorGoogleCallback } from '@/services/proctorGoogleAuth';
export { ProctorAuthCache } from '@/services/proctorAuthCache';
export { confirmProctorLogout } from '@/utils/confirmProctorLogout';
