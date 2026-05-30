const { withMainActivity, withAndroidManifest } = require("expo/config-plugins");

const MARKER = "VidehCallPip";

/**
 * Android Picture-in-Picture for video calls (system PiP on Home).
 */
function withVidehCallPip(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest?.application?.[0];
    if (!app?.activity) return cfg;
    for (const activity of app.activity) {
      const name = String(activity.$?.["android:name"] ?? "");
      if (name.endsWith("MainActivity")) {
        activity.$["android:supportsPictureInPicture"] = "true";
        activity.$["android:resizeableActivity"] = "true";
        if (!activity["intent-filter"]) activity["intent-filter"] = [];
        const filters = Array.isArray(activity["intent-filter"])
          ? activity["intent-filter"]
          : [activity["intent-filter"]];
        const hasJoinCall = filters.some((f) =>
          (f.action || []).some((a) => String(a.$?.["android:name"] ?? "").includes("VIEW")),
        );
        if (!hasJoinCall) {
          filters.push({
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            category: [
              { $: { "android:name": "android.intent.category.DEFAULT" } },
              { $: { "android:name": "android.intent.category.BROWSABLE" } },
            ],
            data: [{ $: { "android:scheme": "videh", "android:host": "join-call" } }],
          });
        }
        activity["intent-filter"] = filters;
      }
    }
    return cfg;
  });

  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;

    const pipHook = `
    // ${MARKER}
    override fun onUserLeaveHint() {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && VidehPipHolder.enterOnLeave) {
        try {
          val ratio = Rational(9, 16)
          val params = PictureInPictureParams.Builder().setAspectRatio(ratio).build()
          enterPictureInPictureMode(params)
        } catch (_: Exception) { }
      }
      super.onUserLeaveHint()
    }
`;

    const pipHolder = `
object VidehPipHolder {
  @JvmField var enterOnLeave: Boolean = false
}
`;

    if (!contents.includes("import android.os.Build")) {
      contents = contents.replace(
        /^package .+\n/m,
        (m) => `${m}import android.os.Build\nimport android.util.Rational\nimport android.app.PictureInPictureParams\n`,
      );
    }

    if (!contents.includes("object VidehPipHolder")) {
      contents = `${pipHolder}\n${contents}`;
    }

    if (contents.includes("class MainActivity")) {
      contents = contents.replace(/class MainActivity[^{]+\{/, (m) => `${m}${pipHook}`);
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withVidehCallPip;
