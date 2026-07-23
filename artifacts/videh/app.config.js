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

module.exports = ({ config }) => {
  const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const slim = process.env.VIDEOH_SLIM_ANDROID === "1";
  const buildArchs = slim
    ? ["arm64-v8a"]
    : ["armeabi-v7a", "arm64-v8a", "x86_64"];

  // Belt-and-suspenders: some EAS prebuild paths drop fields from the static app.json.
  let staticAndroid = {};
  try {
    staticAndroid = require("./app.json")?.expo?.android ?? {};
  } catch {
    staticAndroid = {};
  }

  const plugins = (config.plugins ?? []).map((p) => {
    if (!Array.isArray(p) || p[0] !== "expo-build-properties") return p;
    const [, opts] = p;
    return [
      "expo-build-properties",
      {
        ...opts,
        android: {
          ...(opts?.android ?? {}),
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

  const androidVersionCode =
    Number(config.android?.versionCode) ||
    Number(staticAndroid.versionCode) ||
    184;

  return withGooglePlayAdiRegistration({
    ...config,
    android: {
      ...config.android,
      // Always set explicitly — dynamic app.config.js cannot be auto-patched by prebuild
      // when package/versionCode is missing (EAS would ship package anonymous + versionCode 1).
      package: config.android?.package || "com.videh.app",
      versionCode: androidVersionCode,
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: "./google-services.json" } : {}),
    },
    ios: {
      ...config.ios,
      bundleIdentifier: config.ios?.bundleIdentifier || "com.videh.app",
    },
    web: {
      ...config.web,
      ...(vapidPublicKey ? { notification: { vapidPublicKey } } : {}),
    },
    extra: {
      ...config.extra,
      ...(vapidPublicKey ? { vapidPublicKey } : {}),
    },
    plugins: basePlugins,
  });
};
