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
 * Load the full static Expo config ourselves.
 * Do NOT rely on the `{ config }` argument alone — on some EAS prebuild paths it
 * arrives incomplete and Android then falls back to package.json
 * (`@workspace/videh` / `0.0.0`), which also breaks splash/adaptive icons.
 */
module.exports = () => {
  const staticExpo = require("./app.json").expo;
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
  const versionCode = Number(staticExpo.android?.versionCode) || 185;

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
