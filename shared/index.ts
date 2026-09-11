/**
 * Cross-feature primitives. Prefer this barrel over deep `@/shared/...` paths
 * in new code; features own everything else.
 */
export * from '@/shared/components/ui';
export { VersionInfo } from '@/shared/components/VersionInfo';
export { SchoolLogo } from '@/shared/components/SchoolLogo';

export { useAppTheme } from '@/shared/hooks/useAppTheme';
export { useAppState } from '@/shared/hooks/useAppState';
export { useHardwareBack } from '@/shared/hooks/useHardwareBack';

export { appStorage } from '@/shared/services/storage';
export { DeviceService } from '@/shared/services/DeviceService';

export * from '@/shared/constants';
export * from '@/shared/types';
