const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Release APK: HTTPS only, system CAs only (blocks Charles / mitmproxy user certs).
 * videh.co.in + includeSubdomains covers: ads, developer, api, video, web, etc.
 * Other HTTPS hosts (Razorpay, CDN, media) still work via base-config system CAs.
 * Debug builds: debug-overrides allow user CAs for development.
 */
const NETWORK_SECURITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">videh.co.in</domain>
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </domain-config>
  <debug-overrides>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </debug-overrides>
</network-security-config>`;

function withNetworkSecurity(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resPath = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(resPath, { recursive: true });
      fs.writeFileSync(path.join(resPath, "network_security_config.xml"), NETWORK_SECURITY_XML, "utf8");
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest?.application?.[0];
    if (app?.$) {
      app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
      app.$["android:usesCleartextTraffic"] = "false";
    }
    return cfg;
  });
}

module.exports = withNetworkSecurity;
