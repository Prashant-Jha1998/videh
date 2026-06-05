const { withAndroidManifest } = require("expo/config-plugins");

/** adjustResize shrinks the chat window above the keyboard (WhatsApp-style). */
function withAndroidAdjustResize(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest?.application?.[0];
    if (!app?.activity) return cfg;

    for (const activity of app.activity) {
      const name = String(activity.$?.["android:name"] ?? "");
      if (!name.endsWith("MainActivity")) continue;
      activity.$["android:windowSoftInputMode"] = "adjustResize";
    }

    return cfg;
  });
}

module.exports = withAndroidAdjustResize;
