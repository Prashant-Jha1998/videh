const { withAndroidManifest, withMainActivity, AndroidConfig } = require("expo/config-plugins");

const MARKER = "VidehScreenShareMediaProjection";

/**
 * Enable react-native-webrtc screen capture on Android 10+ (MediaProjection foreground service).
 */
function withVidehScreenShare(config) {
  config = withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
    ]);
    return cfg;
  });

  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }

    const importLine = "import com.oney.WebRTCModule.WebRTCModuleOptions";
    const initCode = `
    // ${MARKER}
    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true
`;

    if (!contents.includes("WebRTCModuleOptions") && contents.includes("import android.os.Bundle")) {
      contents = contents.replace("import android.os.Bundle", `import android.os.Bundle\n${importLine}`);
    }

    if (contents.includes("super.onCreate(null)")) {
      contents = contents.replace("super.onCreate(null)", `super.onCreate(null)${initCode}`);
    } else if (contents.includes("super.onCreate(savedInstanceState)")) {
      contents = contents.replace(
        "super.onCreate(savedInstanceState)",
        `super.onCreate(savedInstanceState)${initCode}`,
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withVidehScreenShare;
