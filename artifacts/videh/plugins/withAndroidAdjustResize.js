const { withAndroidManifest } = require("expo/config-plugins");

/** adjustNothing: keyboard-controller lifts the composer; resize/pan fight RN edge-to-edge. */
function withAndroidAdjustResize(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest?.application?.[0];
    if (!app?.activity) return cfg;

    for (const activity of app.activity) {
      const name = String(activity.$?.["android:name"] ?? "");
      if (!name.endsWith("MainActivity")) continue;
      activity.$["android:windowSoftInputMode"] = "adjustNothing";
    }

    return cfg;
  });
}

module.exports = withAndroidAdjustResize;
