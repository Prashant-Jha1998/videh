const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const ADI_REGISTRATION_TOKEN = "DWT6ACRQC3JDUAAAAAAAAAAAAA";

function withGooglePlayAdiRegistration(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets",
      );

      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, "adi-registration.properties"),
        `${ADI_REGISTRATION_TOKEN}\n`,
      );

      return config;
    },
  ]);
}

/**
 * Static Expo fields live in app.base.json (NOT app.json).
 * EAS often omits app.json from the upload when app.config.js is present,
 * which made require("./app.json") fail on the builder.
 */
module.exports = () => {
  const basePath = path.join(__dirname, "app.base.json");
  const staticExpo = JSON.parse(fs.readFileSync(basePath, "utf8")).expo;
  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const slim = process.env.VIDEOH_SLIM_ANDROID === "1";
  const buildArchs = slim
    ? ["arm64-v8a"]
    : ["armeabi-v7a", "arm64-v8a", "x86_64"];

  const plugins = (staticExpo.plugins ?? []).map((p) => {
    if (!Array.isArray(p) || p[0] !== "expo-build-properties") return p;
    const [, opts] = p;
    return [
      "expo-build-properties",
      {
        ...opts,
        android: {
          ...(opts?.android ?? {}),
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          buildToolsVersion: "36.0.0",
          buildArchs,
          ...(slim ? { enableBundleCompression: true } : {}),
        },
      },
    ];
  });

  const withWebRtc = [
    "@config-plugins/react-native-webrtc",
    {
      cameraPermission: "Videh needs camera access for video calls.",
      microphonePermission: "Videh needs microphone access for voice and video calls.",
    },
  ];

  const hasWebRtcPlugin = plugins.some(
    (p) => Array.isArray(p) && p[0] === "@config-plugins/react-native-webrtc",
  );

  const basePlugins = hasWebRtcPlugin ? plugins : [...plugins, withWebRtc];
  const googleServicesPath = path.join(__dirname, "google-services.json");
  const iconPath = "./assets/images/videh_icon_foreground.png";
  const versionCode = Number(staticExpo.android?.versionCode) || 187;

  return withGooglePlayAdiRegistration({
    ...staticExpo,
    name: "Videh",
    slug: "videh",
    version: String(staticExpo.version || "1.0.107"),
    icon: iconPath,
    scheme: "videh",
    splash: {
      image: iconPath,
      resizeMode: "contain",
      backgroundColor: "#12101F",
    },
    android: {
      ...staticExpo.android,
      package: "com.videh.app",
      versionCode,
      adaptiveIcon: {
        foregroundImage: iconPath,
        backgroundColor: "#12101F",
      },
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: "./google-services.json" } : {}),
    },
    ios: {
      ...staticExpo.ios,
      bundleIdentifier: "com.videh.app",
    },
    web: {
      ...staticExpo.web,
      ...(vapidPublicKey ? { notification: { vapidPublicKey } } : {}),
    },
    extra: {
      ...staticExpo.extra,
      ...(vapidPublicKey ? { vapidPublicKey } : {}),
    },
    plugins: basePlugins,
  });
};
