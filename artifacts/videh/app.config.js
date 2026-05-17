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
 * EAS: set VIDEOH_SLIM_ANDROID=1 in eas.json (preview / apkRelease / production) for a much
 * smaller APK/AAB: only arm64-v8a + compressed JS bundle. Omits 32-bit ARM and x86 emulators.
 * Dev client builds leave this unset so x86_64 emulators still work.
 */
module.exports = ({ config }) => {
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

  const googleServicesPath = path.join(__dirname, "google-services.json");
  const android = {
    ...config.android,
    ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: "./google-services.json" } : {}),
  };

  return withGooglePlayAdiRegistration({
    ...config,
    android,
    plugins: hasWebRtcPlugin ? plugins : [...plugins, withWebRtc],
  });
};
