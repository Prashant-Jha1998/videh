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

  return withGooglePlayAdiRegistration({
    ...config,
    android: {
      ...config.android,
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: "./google-services.json" } : {}),
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
