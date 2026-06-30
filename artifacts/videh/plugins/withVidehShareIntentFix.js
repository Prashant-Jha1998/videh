const { withDangerousMod, createRunOncePlugin } = require("expo/config-plugins");
const path = require("path");

const withVidehShareIntentFix = (config) => {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      require(path.join(cfg.modRequest.projectRoot, "scripts", "patch-share-intent"));
      return cfg;
    },
  ]);
};

module.exports = createRunOncePlugin(withVidehShareIntentFix, "with-videh-share-intent-fix", "1.0.1");
