const {
  withAndroidManifest,
  withMainActivity,
  AndroidConfig,
} = require("expo/config-plugins");

const LOCK_SCREEN_MARKER = "VidehIncomingCallLockScreen";

/**
 * Show incoming call UI over the lock screen (WhatsApp-style on Android).
 */
function withIncomingCallAndroid(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    AndroidConfig.Permissions.ensurePermissions(manifest, [
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
      "android.permission.WAKE_LOCK",
    ]);

    const app = manifest.manifest?.application?.[0];
    if (!app?.activity) return cfg;

    for (const activity of app.activity) {
      const name = String(activity.$?.["android:name"] ?? "");
      if (name.endsWith("MainActivity")) {
        activity.$["android:showWhenLocked"] = "true";
        activity.$["android:turnScreenOn"] = "true";
      }
    }
    return cfg;
  });

  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(LOCK_SCREEN_MARKER)) {
      return cfg;
    }

    const kotlinHook = `
    // ${LOCK_SCREEN_MARKER}
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
`;

    if (contents.includes("super.onCreate(null)")) {
      contents = contents.replace("super.onCreate(null)", `super.onCreate(null)${kotlinHook}`);
    } else if (contents.includes("super.onCreate(savedInstanceState)")) {
      contents = contents.replace(
        "super.onCreate(savedInstanceState)",
        `super.onCreate(savedInstanceState)${kotlinHook}`,
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withIncomingCallAndroid;
