const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withMainActivity,
  withDangerousMod,
  AndroidConfig,
} = require("expo/config-plugins");

const LOCK_SCREEN_MARKER = "VidehIncomingCallLockScreen";
const FULL_SCREEN_MARKER = "VidehIncomingCallFullScreenIntent";

/**
 * Show incoming call UI over the lock screen (Videh on Android).
 * Also patches expo-notifications so call notifications use fullScreenIntent + CATEGORY_CALL.
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

  config = withMainActivity(config, (cfg) => {
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

  // Must run after withMainActivity — previous code returned early and never applied this patch.
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const builderPath = path.join(
        cfg.modRequest.projectRoot,
        "node_modules",
        "expo-notifications",
        "android",
        "src",
        "main",
        "java",
        "expo",
        "modules",
        "notifications",
        "notifications",
        "presentation",
        "builders",
        "ExpoNotificationBuilder.kt",
      );
      if (!fs.existsSync(builderPath)) {
        return cfg;
      }
      let contents = fs.readFileSync(builderPath, "utf8");
      if (contents.includes(FULL_SCREEN_MARKER)) {
        return cfg;
      }
      const anchor = `    builder.setContentIntent(
      createNotificationResponseIntent(
        context,
        notification,
        defaultAction
      )
    )`;
      const replacement = `${anchor}

    // ${FULL_SCREEN_MARKER}
    val incomingCallCategory = content.categoryId == "incoming_call"
      || content.data?.get("notificationKind") == "incoming_call"
      || content.data?.get("kind") == "call"
    if (incomingCallCategory) {
      val incomingCallIntent = createNotificationResponseIntent(
        context,
        notification,
        defaultAction
      )
      builder.setFullScreenIntent(incomingCallIntent, true)
      builder.setCategory(NotificationCompat.CATEGORY_CALL)
      builder.setOngoing(true)
      builder.setTimeoutAfter(45_000L)
      builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      builder.setPriority(NotificationCompat.PRIORITY_MAX)
    }`;
      if (contents.includes(anchor)) {
        contents = contents.replace(anchor, replacement);
        fs.writeFileSync(builderPath, contents);
      }
      return cfg;
    },
  ]);
}

module.exports = withIncomingCallAndroid;
