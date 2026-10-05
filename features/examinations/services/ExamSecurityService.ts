import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Constants from 'expo-constants';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BackHandler, Dimensions, NativeModules, Platform } from 'react-native';
import type { ExamSecurityCapabilities } from '@/shared/types';

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
  isLocked?: () => Promise<boolean>;
  startExamHostService?: () => Promise<void>;
  stopExamHostService?: () => Promise<void>;
  startStudentExamService?: () => Promise<void>;
  getExamHostServiceStatus?: () => Promise<{
    running?: boolean;
    partialWakeLockHeld?: boolean;
    wifiLockHeld?: boolean;
  }>;
  isIgnoringBatteryOptimizations?: () => Promise<boolean>;
  requestBatteryOptimizationExemption?: () => Promise<boolean>;
};

const LOCK_TASK_TIMEOUT_MS = 5000;

async function runLockTaskWithTimeout(
  operation: (() => Promise<void>) | undefined,
): Promise<void> {
  if (!operation) return;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Android screen pinning request timed out.')),
          LOCK_TASK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Optional native module bridge for Android Device Owner / Lock Task Mode.
 * Split-screen is already blocked by plugins/withExamSecurity.js
 * (resizeableActivity=false) in development/production builds.
 *
 * ExamKioskModule is active in dev/production builds (not Expo Go).
 * On BYOD devices this enables standard Android Screen Pinning via startLockTask().
 */
function getNativeBridge(): NativeKioskBridge | null {
  const mod = NativeModules.ExamKioskModule as NativeKioskBridge | undefined;
  return mod ?? null;
}

// ─── Standalone helpers used by useExamLock ──────────────────────────────────

/**
 * Starts Android Screen Pinning (Lock Task Mode) for the current activity.
 * On a BYOD device the system may show a one-time confirmation dialog on the
 * very first call if Screen Pinning has not been used before.
 * On iOS this is a no-op — AppState monitoring handles violation detection.
 */
export async function startExamLock(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const bridge = getNativeBridge();
  await runLockTaskWithTimeout(bridge?.startLockTask?.bind(bridge));
}

/**
 * Stops Android Screen Pinning. Call when the exam ends, is submitted,
 * or a proctor force-ends the session.
 */
export async function stopExamLock(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const bridge = getNativeBridge();
  await runLockTaskWithTimeout(bridge?.stopLockTask?.bind(bridge));
}

/**
 * Queries whether the app is currently in Lock Task Mode (screen-pinned).
 * Returns false on iOS or when the native module is unavailable.
 */
export async function isExamLocked(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const bridge = getNativeBridge();
    if (!bridge?.isLocked) return false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        bridge.isLocked(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Lock state query timed out.')), LOCK_TASK_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch {
    return false;
  }
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
  hasExamHostForegroundService(): boolean {
    return Platform.OS === 'android' && Boolean(getNativeBridge()?.startExamHostService);
  },

  /** Keep the proctor-hosted LAN server in a foreground service on Android. */
  async startExamHostKeepAlive(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      const bridge = getNativeBridge();
      await bridge?.startExamHostService?.();
      if (__DEV__ && bridge?.getExamHostServiceStatus) {
        void (async () => {
          const deadline = Date.now() + 3000;
          let status = await bridge.getExamHostServiceStatus?.();
          while (!status?.running && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            status = await bridge.getExamHostServiceStatus?.();
          }
          console.info('[EXAM HOST] foreground service status', status);
        })().catch((error) => {
          console.warn('[EXAM HOST] Could not verify foreground service:', error);
        });
      }
    } catch (err) {
      console.warn('[EXAM HOST] Foreground service could not start:', err);
    }
  },

  async getExamHostServiceStatus(): Promise<{
    running: boolean;
    partialWakeLockHeld: boolean;
    wifiLockHeld: boolean;
  }> {
    if (Platform.OS !== 'android') {
      return { running: false, partialWakeLockHeld: false, wifiLockHeld: false };
    }
    try {
      const status = await getNativeBridge()?.getExamHostServiceStatus?.();
      return {
        running: status?.running === true,
        partialWakeLockHeld: status?.partialWakeLockHeld === true,
        wifiLockHeld: status?.wifiLockHeld === true,
      };
    } catch {
      return { running: false, partialWakeLockHeld: false, wifiLockHeld: false };
    }
  },

  async stopExamHostKeepAlive(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await getNativeBridge()?.stopExamHostService?.();
    } catch {
      // A service that did not start needs no cleanup.
    }
  },

  async startStudentExamKeepAlive(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await getNativeBridge()?.startStudentExamService?.();
    } catch (err) {
      console.warn('[STUDENT EXAM] Foreground service could not start:', err);
    }
  },

  async stopStudentExamKeepAlive(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await getNativeBridge()?.stopExamHostService?.();
    } catch {
      // A service that did not start needs no cleanup.
    }
  },

  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      return (await getNativeBridge()?.isIgnoringBatteryOptimizations?.()) ?? false;
    } catch {
      return false;
    }
  },

  async requestBatteryOptimizationExemption(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await getNativeBridge()?.requestBatteryOptimizationExemption?.()) ?? false;
    } catch {
      return false;
    }
  },

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
        await ScreenCapture.enableAppSwitcherProtectionAsync(1.0);
      } catch {
        // ignore
      }
    }

    // Native Device Owner / Lock Task (production build only)
    try {
      await native?.setImmersiveMode?.(true);
      await native?.blockMultiWindow?.(true);
      await startExamLock();
    } catch {
      // Expo Go: native kiosk unavailable — AppState monitoring still applies
    }

    return capabilities;
  },

  async disableExamMode(): Promise<void> {
    const native = getNativeBridge();

    try {
      await stopExamLock();
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
