import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Constants from 'expo-constants';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BackHandler, Dimensions, Platform } from 'react-native';
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
 * Split-screen is already blocked by plugins/withExamSecurity.js
 * (resizeableActivity=false) in development/production builds.
 */
function getNativeBridge(): NativeKioskBridge | null {
  return null;
}

/**
 * ExamSecurityService — Secure Examination / Kiosk Mode.
 *
 * Build-time (plugins/withExamSecurity.js):
 *   - Android: resizeableActivity=false, supportsPictureInPicture=false
 * Runtime (this service + expo-screen-capture):
 *   - FLAG_SECURE (blocks screenshots and screen recordings on Android)
 *   - AppState monitoring (tab switch / home button → violation)
 *   - Hardware back lock
 * System-level kiosk (Recent Apps / status bar) still needs Device Owner.
 */
export const ExamSecurityService = {
  async getCapabilities(): Promise<ExamSecurityCapabilities> {
    const captureAvailable = await ScreenCapture.isAvailableAsync().catch(() => false);
    const native = getNativeBridge();
    // The withExamSecurity config plugin sets resizeableActivity=false on Android
    // builds. Expo Go cannot honour that, so report false there.
    const buildBlocksSplitScreen =
      Platform.OS === 'android' && Constants.appOwnership !== 'expo';

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
      multiWindowBlock: buildBlocksSplitScreen || Boolean(native?.blockMultiWindow),
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

    // FLAG_SECURE on Android: black screen for screenshots AND screen recordings.
    // Must run in a development/production build — Expo Go ignores this flag.
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
   * Soft multi-window detector: when the window shrinks well below the screen
   * (typical of split-screen), fire a violation. Hard-block is the config plugin.
   */
  addMultiWindowListener(onDetected: () => void): ExamSecurityListener {
    const screen = Dimensions.get('screen');
    let fired = false;

    const onChange = ({ window }: { window: { width: number; height: number } }) => {
      const ratio =
        (window.width * window.height) / Math.max(1, screen.width * screen.height);
      // Below ~70% of the physical screen usually means split-screen / freeform.
      if (ratio < 0.7 && !fired) {
        fired = true;
        onDetected();
        // Allow another detection if the student returns to full screen then splits again.
        setTimeout(() => {
          fired = false;
        }, 4000);
      }
    };

    const subscription = Dimensions.addEventListener('change', onChange);
    return {
      remove: () => subscription.remove(),
    };
  },
};
