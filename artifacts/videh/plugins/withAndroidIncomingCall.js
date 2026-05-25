const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

/** Ensures incoming call notifications can use full-screen intent on Android 10+. */
function withAndroidIncomingCall(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    AndroidConfig.Manifest.ensurePermission(manifest, "android.permission.USE_FULL_SCREEN_INTENT");
    AndroidConfig.Manifest.ensurePermission(manifest, "android.permission.WAKE_LOCK");
    AndroidConfig.Manifest.ensurePermission(manifest, "android.permission.VIBRATE");
    return cfg;
  });
}

module.exports = withAndroidIncomingCall;
