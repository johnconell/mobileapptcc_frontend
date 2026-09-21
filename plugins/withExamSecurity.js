const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KIOSK_MODULE_SRC = `package edu.tcc.entranceexam

import android.app.Activity
import android.os.Build
import android.view.View
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * ExamKioskModule — Native Kiosk / Lock Task Mode bridge for MasterExam.
 *
 * Security features for personal (BYOD) student phones:
 * - Hides non-system overlay windows (chatheads, floating screens) via setHideOverlayWindows (API 31+).
 * - Filters touches when obscured (prevents tap-jacking / overlays).
 * - Window focus loss detection: if a student taps any floating screen/bubble, triggers onWindowFocusLost.
 * - startLockTask: Triggers Android Screen Pinning (locks status bar, quick settings, and navigation bar).
 * - stopLockTask: Unpins the app cleanly upon exam submission or termination.
 * - setImmersiveMode: Hides system status bar and navigation bar (Immersive Sticky Mode).
 */
class ExamKioskModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        instance = this
    }

    override fun getName(): String = "ExamKioskModule"

    companion object {
        private var instance: ExamKioskModule? = null
        var isKioskActive: Boolean = false

        fun onWindowFocusChanged(hasFocus: Boolean) {
            if (isKioskActive) {
                if (!hasFocus) {
                    // Focus was lost to an overlay, floating window, or notification shade!
                    instance?.sendEvent("onWindowFocusLost", null)
                } else {
                    // Focus was regained
                    instance?.sendEvent("onWindowFocusGained", null)
                }
            }
        }
    }

    fun sendEvent(eventName: String, params: Any?) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            // Context might be uninitialized or tearing down
        }
    }

    @ReactMethod
    fun startLockTask(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            try {
                isKioskActive = true
                applyOverlayProtections(activity, true)
                activity.startLockTask()
                promise.resolve(null)
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun stopLockTask(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            try {
                isKioskActive = false
                applyOverlayProtections(activity, false)
                activity.stopLockTask()
                promise.resolve(null)
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun setImmersiveMode(enabled: Boolean, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }
        activity.runOnUiThread {
            try {
                isKioskActive = enabled
                applyOverlayProtections(activity, enabled)

                val window = activity.window
                val insetsController = WindowCompat.getInsetsController(window, window.decorView)
                insetsController.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

                if (enabled) {
                    insetsController.hide(WindowInsetsCompat.Type.systemBars())
                } else {
                    insetsController.show(WindowInsetsCompat.Type.systemBars())
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    private fun applyOverlayProtections(activity: Activity, enable: Boolean) {
        try {
            val window = activity.window
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                window.setHideOverlayWindows(enable)
            }
            window.decorView.filterTouchesWhenObscured = enable
        } catch (e: Exception) {
            // ignore non-critical window exceptions
        }
    }

    @ReactMethod
    fun blockMultiWindow(enabled: Boolean, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep for RN Event Emitter contract
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep for RN Event Emitter contract
    }

    @ReactMethod
    fun isLocked(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity == null) {
                promise.resolve(false)
                return
            }
            val am = activity.getSystemService(android.content.Context.ACTIVITY_SERVICE)
                      as android.app.ActivityManager
            // LOCK_TASK_MODE_NONE = 0, LOCK_TASK_MODE_LOCKED = 1, LOCK_TASK_MODE_PINNED = 2
            promise.resolve(am.lockTaskModeState != android.app.ActivityManager.LOCK_TASK_MODE_NONE)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
`;

const KIOSK_PACKAGE_SRC = `package edu.tcc.entranceexam

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ExamKioskPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ExamKioskModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

/**
 * Hardens the Android exam build:
 * - resizeableActivity=false blocks split-screen / multi-window
 * - supportsPictureInPicture=false blocks PiP
 * - excludeFromRecents=true removes app from Recent Apps tray
 * - lockTaskMode=if_whitelisted enables silent kiosk on MDM / Device Owner
 * - HIDE_OVERLAY_WINDOWS permission hides chatheads and floating windows
 * - registers ExamKioskModule for immersive mode & screen pinning
 *
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withExamSecurity(config) {
  // 1. AndroidManifest hardening
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);

    // Required for LAN peer exam hosting (HTTP on the proctor phone) and local API.
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    mainActivity.$['android:resizeableActivity'] = 'false';
    mainActivity.$['android:supportsPictureInPicture'] = 'false';

    // Hide the exam app from the Recent Apps switcher so students cannot
    // tap a previous app's thumbnail or use Recent Apps to navigate away.
    mainActivity.$['android:excludeFromRecents'] = 'true';

    // Lock Task Mode — active only when the device is Device Owner / MDM whitelisted.
    // No-op on regular BYOD phones, but enables full kiosk lock on institution-managed devices.
    mainActivity.$['android:lockTaskMode'] = 'if_whitelisted';

    // Prefer a single task so Recent Apps cannot fan out extra exam windows.
    if (!mainActivity.$['android:launchMode']) {
      mainActivity.$['android:launchMode'] = 'singleTask';
    }

    // Permission to hide all non-system overlay windows (chat heads, floating apps)
    AndroidConfig.Permissions.addPermission(manifest, 'android.permission.HIDE_OVERLAY_WINDOWS');

    return config;
  });

  // 2. Ensure Kotlin files exist in android/app/src/main/java/edu/tcc/entranceexam/
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java/edu/tcc/entranceexam'
      );
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const modulePath = path.join(targetDir, 'ExamKioskModule.kt');
      const packagePath = path.join(targetDir, 'ExamKioskPackage.kt');
      const mainActivityPath = path.join(targetDir, 'MainActivity.kt');

      fs.writeFileSync(modulePath, KIOSK_MODULE_SRC, 'utf8');
      fs.writeFileSync(packagePath, KIOSK_PACKAGE_SRC, 'utf8');

      if (fs.existsSync(mainActivityPath)) {
        let activityContent = fs.readFileSync(mainActivityPath, 'utf8');
        if (!activityContent.includes('onWindowFocusChanged')) {
          activityContent = activityContent.replace(
            /\}\s*$/,
            `  override fun onWindowFocusChanged(hasFocus: Boolean) {
      super.onWindowFocusChanged(hasFocus)
      ExamKioskModule.onWindowFocusChanged(hasFocus)
  }
}
`
          );
          fs.writeFileSync(mainActivityPath, activityContent, 'utf8');
        }
      }

      return config;
    },
  ]);

  // 3. Register ExamKioskPackage in MainApplication.kt
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('ExamKioskPackage')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        'PackageList(this).packages.apply {\n              add(ExamKioskPackage())'
      );
      config.modResults.contents = contents;
    }
    return config;
  });

  return config;
}

module.exports = withExamSecurity;
