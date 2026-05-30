const {
  withDangerousMod,
  withMainApplication,
  createRunOncePlugin,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MODULE_KT = `package com.videh.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VidehPipModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "VidehPip"

  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    VidehPipHolder.enterOnLeave = enabled
  }
}
`;

const PACKAGE_KT = `package com.videh.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class VidehPipPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(VidehPipModule(reactContext))
  }
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const withVidehPipModule = (config) => {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const pkgDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        "com",
        "videh",
        "app",
      );
      ensureDir(pkgDir);
      fs.writeFileSync(path.join(pkgDir, "VidehPipModule.kt"), MODULE_KT);
      fs.writeFileSync(path.join(pkgDir, "VidehPipPackage.kt"), PACKAGE_KT);
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes("VidehPipPackage")) return cfg;
    if (contents.includes("packages.add")) {
      contents = contents.replace(
        /packages\.add\(/,
        "packages.add(VidehPipPackage())\n            packages.add(",
      );
    } else if (contents.includes("PackageList")) {
      contents = contents.replace(
        /val packages = PackageList\(this\)\.packages/,
        "val packages = PackageList(this).packages.apply { add(VidehPipPackage()) }",
      );
    }
    if (!contents.includes("import com.videh.app.VidehPipPackage")) {
      contents = contents.replace(
        /^package .+\n/,
        (m) => `${m}import com.videh.app.VidehPipPackage\n`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
};

module.exports = createRunOncePlugin(withVidehPipModule, "with-videh-pip-module", "1.0.0");
