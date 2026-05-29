const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Show incoming call UI over the lock screen (WhatsApp-style on Android).
 */
function withIncomingCallAndroid(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest?.application?.[0];
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
}

module.exports = withIncomingCallAndroid;
