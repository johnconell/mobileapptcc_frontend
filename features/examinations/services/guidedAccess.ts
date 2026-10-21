import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';

type GuidedAccessModule = {
  isGuidedAccessEnabled: () => boolean;
  addListener: (
    event: 'onGuidedAccessStatusChanged',
    listener: (event: { enabled: boolean }) => void,
  ) => EventSubscription;
};

export type GuidedAccessStatus = 'enabled' | 'disabled' | 'unavailable';

function nativeModule(): GuidedAccessModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<GuidedAccessModule>('ExpoGuidedAccess');
  } catch {
    return null;
  }
}

/** A fresh native reading is required at every protected transition. */
export function readGuidedAccessStatus(): GuidedAccessStatus {
  if (Platform.OS !== 'ios') return 'enabled';
  const module = nativeModule();
  if (!module || typeof module.isGuidedAccessEnabled !== 'function') return 'unavailable';
  try {
    return module.isGuidedAccessEnabled() === true ? 'enabled' : 'disabled';
  } catch {
    return 'unavailable';
  }
}

export function requireGuidedAccess(): void {
  const status = readGuidedAccessStatus();
  if (status === 'enabled') return;
  throw new Error(
    status === 'unavailable'
      ? 'Guided Access verification is unavailable. Install the latest iOS app build and try again.'
      : 'Guided Access is required. Enable it in Settings > Accessibility > Guided Access, then triple-click the Side Button and tap Start.',
  );
}

export function observeGuidedAccessChange(onChange: (status: GuidedAccessStatus) => void): () => void {
  const module = nativeModule();
  if (!module || typeof module.addListener !== 'function') return () => undefined;
  try {
    const subscription = module.addListener('onGuidedAccessStatusChanged', (event) => {
      // A loss signal locks immediately. A gain still requires a fresh native read.
      onChange(event?.enabled === false ? 'disabled' : readGuidedAccessStatus());
    });
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}
