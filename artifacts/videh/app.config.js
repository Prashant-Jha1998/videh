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

  return { ...config, plugins };
};
