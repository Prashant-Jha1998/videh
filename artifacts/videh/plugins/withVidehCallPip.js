const { withMainActivity, withAndroidManifest } = require("expo/config-plugins");

const MARKER = "VidehCallPip";

function addKotlinImports(contents, imports) {
  const missing = imports.filter((line) => !contents.includes(line));
  if (missing.length === 0) return contents;
  const importMatches = [...contents.matchAll(/^import .+$/gm)];
  if (importMatches.length > 0) {
    const last = importMatches[importMatches.length - 1];
    const pos = last.index + last[0].length;
    return `${contents.slice(0, pos)}\n${missing.join("\n")}${contents.slice(pos)}`;
  }
  return contents.replace(/^package .+\n/m, (pkg) => `${pkg}${missing.join("\n")}\n`);
}

function insertBeforeMainActivity(contents, snippet) {
  if (contents.includes(snippet.trim().split("\n")[0])) return contents;
  if (!contents.includes("class MainActivity")) return `${snippet}\n${contents}`;
  return contents.replace(/(\n)(class MainActivity)/, `\n\n${snippet.trim()}\n$2`);
}

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

    const pipHolder = `object VidehPipHolder {
  @JvmField var enterOnLeave: Boolean = false
}`;

    contents = addKotlinImports(contents, [
      "import android.os.Build",
      "import android.util.Rational",
      "import android.app.PictureInPictureParams",
    ]);
    contents = insertBeforeMainActivity(contents, pipHolder);

    if (contents.includes("class MainActivity")) {
      contents = contents.replace(/class MainActivity[^{]+\{/, (m) => `${m}${pipHook}`);
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withVidehCallPip;
