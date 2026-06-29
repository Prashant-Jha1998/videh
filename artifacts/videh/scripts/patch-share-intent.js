const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function patchKotlin() {
  const kotlinPath = path.join(
    root,
    "node_modules/expo-share-intent/android/src/main/java/expo/modules/shareintent/ExpoShareIntentModule.kt",
  );
  if (!fs.existsSync(kotlinPath)) {
    console.log("kotlin not found, skip");
    return;
  }
  let content = fs.readFileSync(kotlinPath, "utf8");
  if (content.includes("VIDEH_SHARE_INTENT_FIX")) {
    console.log("kotlin already patched");
    return;
  }

  content = content.replace(
    "        fun handleShareIntent(intent: Intent) {",
    `        private fun extractShareText(intent: Intent): String? {
            val direct = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
            if (!direct.isNullOrEmpty()) return direct
            val html = intent.getStringExtra(Intent.EXTRA_HTML_TEXT)?.trim()
            if (!html.isNullOrEmpty()) return html
            val subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString()?.trim()
            if (!subject.isNullOrEmpty()) return subject
            val clip = intent.clipData
            if (clip != null && clip.itemCount > 0) {
                val itemText = clip.getItemAt(0).text?.toString()?.trim()
                if (!itemText.isNullOrEmpty()) return itemText
            }
            return null
        }

        // VIDEH_SHARE_INTENT_FIX
        fun handleShareIntent(intent: Intent) {`,
  );

  content = content.replace(
    'if (intent.type!!.startsWith("text/plain")) {',
    'if (intent.type!!.startsWith("text/")) {',
  );

  content = content.replace(
    `"text" to intent.getStringExtra(Intent.EXTRA_TEXT),`,
    `"text" to extractShareText(intent),`,
  );

  content = content.replace(
    'notifyShareIntent(mapOf( "files" to arrayOf(getFileInfo(uri), "type" to "file")))',
    'notifyShareIntent(mapOf("files" to listOf(getFileInfo(uri)), "type" to "file", "text" to extractShareText(intent)))',
  );

  content = content.replace(
    'notifyShareIntent(mapOf( "files" to uris.map { getFileInfo(it) }, "type" to "file"))',
    'notifyShareIntent(mapOf("files" to uris.map { getFileInfo(it) }, "type" to "file", "text" to extractShareText(intent)))',
  );

  const needle = `} else {
                // files / medias
                if (intent.action == Intent.ACTION_SEND) {
                    val uri = intent.parcelable<Uri>(Intent.EXTRA_STREAM);
                    if (uri != null) {`;

  const replacement = `} else {
                // files / medias
                val sharedText = extractShareText(intent)
                if (intent.action == Intent.ACTION_SEND) {
                    val uri = intent.parcelable<Uri>(Intent.EXTRA_STREAM);
                    if (uri == null && !sharedText.isNullOrEmpty()) {
                        notifyShareIntent(mapOf(
                            "text" to sharedText,
                            "type" to "text",
                            "meta" to mapOf(
                                "title" to intent.getCharSequenceExtra(Intent.EXTRA_TITLE),
                            )
                        ))
                        return
                    }
                    if (uri != null) {`;

  if (content.includes(needle)) {
    content = content.replace(needle, replacement);
  }

  fs.writeFileSync(kotlinPath, content);
  console.log("kotlin patched");
}

function patchUtils() {
  const utilsPath = path.join(root, "node_modules/expo-share-intent/build/utils.js");
  if (!fs.existsSync(utilsPath)) {
    console.log("utils not found, skip");
    return;
  }
  let content = fs.readFileSync(utilsPath, "utf8");
  if (content.includes("videh-share-intent-text-with-files")) {
    console.log("utils already patched");
    return;
  }

  content = content.replace(
    "export const parseShareIntent = (value, options) => {",
    `export const parseShareIntent = (value, options) => {
    /* videh-share-intent-text-with-files */`,
  );

  const anchor = "        const isMedia = files.every((file) => file.mimeType.startsWith(\"image/\") ||";
  if (!content.includes(anchor)) {
    console.log("utils anchor missing");
    return;
  }

  content = content.replace(
    `            type: isMedia ? "media" : "file",
        };`,
    `            type: isMedia ? "media" : "file",
            text: typeof shareIntent?.text === "string" ? shareIntent.text.trim() || null : null,
            meta: shareIntent?.meta && typeof shareIntent.meta === "object" ? shareIntent.meta : null,
        };`,
  );

  fs.writeFileSync(utilsPath, content);
  console.log("utils patched");
}

patchKotlin();
patchUtils();
