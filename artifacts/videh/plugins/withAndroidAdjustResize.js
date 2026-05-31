const { withAndroidManifest } = require("expo/config-plugins");

/** adjustPan + JS keyboard inset lifts composer (resize often fails with edge-to-edge / RN 0.81). */
function withAndroidAdjustResize(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest?.application?.[0];
    if (!app?.activity) return cfg;

    for (const activity of app.activity) {
      const name = String(activity.$?.["android:name"] ?? "");
      if (!name.endsWith("MainActivity")) continue;
      activity.$["android:windowSoftInputMode"] = "adjustPan";
    }

    return cfg;
  });
}

module.exports = withAndroidAdjustResize;
