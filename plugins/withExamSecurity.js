const {
  withAndroidManifest,
  AndroidConfig,
} = require('expo/config-plugins');

/**
 * Hardens the Android exam build:
 * - resizeableActivity=false blocks split-screen / multi-window
 * - supportsPictureInPicture=false blocks PiP
 *
 * Screen capture / recording is blocked at runtime by expo-screen-capture
 * (FLAG_SECURE). This plugin only covers what the JS layer cannot.
 *
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withExamSecurity(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);

    mainActivity.$['android:resizeableActivity'] = 'false';
    mainActivity.$['android:supportsPictureInPicture'] = 'false';

    // Prefer a single task so Recent Apps cannot fan out extra exam windows.
    if (!mainActivity.$['android:launchMode']) {
      mainActivity.$['android:launchMode'] = 'singleTask';
    }

    return config;
  });
}

module.exports = withExamSecurity;
