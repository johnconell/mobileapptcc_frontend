import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BackHandler, Platform } from 'react-native';
import type { ExamSecurityCapabilities } from '@/types';

const EXAM_MODE_KEY = 'tcc-exam-kiosk';
const KEEP_AWAKE_TAG = 'tcc-exam-kiosk-awake';

export type ExamSecurityListener = {
  remove: () => void;
};

type NativeKioskBridge = {
  startLockTask?: () => Promise<void>;
  stopLockTask?: () => Promise<void>;
  setImmersiveMode?: (enabled: boolean) => Promise<void>;
  blockMultiWindow?: (enabled: boolean) => Promise<void>;
};

/**
 * Optional native module bridge for Android Device Owner / Lock Task Mode.
 * Replace `getNativeBridge()` later with a real native module without changing UI.
 */
function getNativeBridge(): NativeKioskBridge | null {
  // Future: return NativeModules.TccExamKiosk or expo-modules native package.
  return null;
}

/**
 * ExamSecurityService — Secure Examination / Kiosk Mode.
 *
 * Expo SDK 54 provides maximum available app-level protections.
 * System-level kiosk (Recent Apps, Status Bar, Nav Bar, Split Screen hard-block)
 * requires Android Device Owner Lock Task Mode — prepared via native bridge stubs.
 */
export const ExamSecurityService = {
  async getCapabilities(): Promise<ExamSecurityCapabilities> {
    const captureAvailable = await ScreenCapture.isAvailableAsync().catch(() => false);
    const native = getNativeBridge();

    return {
      keepAwake: true,
      portraitLock: true,
      preventScreenCapture: captureAvailable,
      appSwitcherProtection: captureAvailable,
      screenshotListener: captureAvailable,
      navigationLock: true,
      backButtonLock: true,
      kioskNativeLockTask: Boolean(native?.startLockTask),
      immersiveSystemUi: Boolean(native?.setImmersiveMode),
      multiWindowBlock: Boolean(native?.blockMultiWindow),
    };
  },

  /** Alias used by kiosk hooks */
  async enableSecureExamMode(): Promise<ExamSecurityCapabilities> {
    return this.enableExamMode();
  },

  async disableSecureExamMode(): Promise<void> {
    return this.disableExamMode();
  },

  /**
   * Enable Secure Exam Mode (Expo maximum + native bridge when present).
   */
  async enableExamMode(): Promise<ExamSecurityCapabilities> {
    const capabilities = await this.getCapabilities();
    const native = getNativeBridge();

    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch {
      // unsupported
    }

    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } catch {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      } catch {
        // ignore
      }
    }

    if (capabilities.preventScreenCapture) {
      try {
        await ScreenCapture.preventScreenCaptureAsync(EXAM_MODE_KEY);
      } catch {
        // ignore
      }
    }

    // iOS: blur in app switcher. Android: FLAG_SECURE via preventScreenCaptureAsync.
    if (Platform.OS === 'ios' && capabilities.appSwitcherProtection) {
      try {
        await ScreenCapture.enableAppSwitcherProtectionAsync(0.85);
      } catch {
        // ignore
      }
    }

    // Native Device Owner / Lock Task (production build only)
    try {
      await native?.setImmersiveMode?.(true);
      await native?.blockMultiWindow?.(true);
      await native?.startLockTask?.();
    } catch {
      // Expo Go: native kiosk unavailable — AppState monitoring still applies
    }

    return capabilities;
  },

  async disableExamMode(): Promise<void> {
    const native = getNativeBridge();

    try {
      await native?.stopLockTask?.();
      await native?.setImmersiveMode?.(false);
      await native?.blockMultiWindow?.(false);
    } catch {
      // ignore
    }

    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // ignore
    }

    try {
      await ScreenCapture.allowScreenCaptureAsync(EXAM_MODE_KEY);
    } catch {
      // ignore
    }

    try {
      await ScreenCapture.disableAppSwitcherProtectionAsync();
    } catch {
      // ignore
    }

    try {
      await ScreenOrientation.unlockAsync();
    } catch {
      // ignore
    }
  },

  /**
   * Hard-consume Android hardware back presses while exam kiosk is active.
   * Returns a disposer.
   */
  lockBackButton(onAttempt?: () => void): ExamSecurityListener {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onAttempt?.();
      return true; // block default back navigation
    });

    return {
      remove: () => subscription.remove(),
    };
  },

  addScreenshotListener(onScreenshot: () => void): ExamSecurityListener {
    let subscription: { remove: () => void } | null = null;

    void (async () => {
      try {
        const available = await ScreenCapture.isAvailableAsync();
        if (!available) return;

        if (Platform.OS === 'android') {
          const permission = await ScreenCapture.getPermissionsAsync();
          if (!permission.granted) {
            const requested = await ScreenCapture.requestPermissionsAsync();
            if (!requested.granted) return;
          }
        }

        subscription = ScreenCapture.addScreenshotListener(onScreenshot);
      } catch {
        // Expo Go / web limitations
      }
    })();

    return {
      remove: () => {
        subscription?.remove();
      },
    };
  },

  /**
   * Placeholder for native multi-window / PiP detection callbacks.
   * Wired when Lock Task / Device Owner module is integrated.
   */
  addMultiWindowListener(_onDetected: () => void): ExamSecurityListener {
    return { remove: () => undefined };
  },
};
