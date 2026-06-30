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
  let changed = false;

  if (!content.includes("VIDEH_SHARE_INTENT_FIX")) {
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
    changed = true;
  }

  if (!content.includes("VIDEH_SHARE_INTENT_URIS")) {
    content = content.replace(
      "        // VIDEH_SHARE_INTENT_FIX\n        fun handleShareIntent(intent: Intent) {",
      `        private fun extractShareUris(intent: Intent): List<Uri> {
            val uris = mutableListOf<Uri>()
            intent.parcelable<Uri>(Intent.EXTRA_STREAM)?.let { uris.add(it) }
            if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
                intent.parcelableArrayList<Uri>(Intent.EXTRA_STREAM)?.forEach { uris.add(it) }
            }
            val clip = intent.clipData
            if (clip != null) {
                for (i in 0 until clip.itemCount) {
                    clip.getItemAt(i).uri?.let { uri ->
                        if (!uris.any { it == uri }) uris.add(uri)
                    }
                }
            }
            return uris
        }

        // VIDEH_SHARE_INTENT_FIX
        // VIDEH_SHARE_INTENT_URIS
        fun handleShareIntent(intent: Intent) {`,
    );

    const textSendNeedle = `if (intent.type!!.startsWith("text/")) {
                // text / urls
                if (intent.action == Intent.ACTION_SEND) {
                    notifyShareIntent(mapOf(
                        "text" to extractShareText(intent),
                        "type" to "text",
                        "meta" to mapOf(
                            "title" to intent.getCharSequenceExtra(Intent.EXTRA_TITLE),
                        )
                    ))`;

    const textSendReplacement = `if (intent.type!!.startsWith("text/")) {
                // text / urls — WhatsApp & others may attach image URI with text/plain
                if (intent.action == Intent.ACTION_SEND) {
                    val uris = extractShareUris(intent)
                    if (uris.isNotEmpty()) {
                        notifyShareIntent(mapOf(
                            "files" to uris.map { getFileInfo(it) },
                            "type" to "file",
                            "text" to extractShareText(intent),
                            "meta" to mapOf(
                                "title" to intent.getCharSequenceExtra(Intent.EXTRA_TITLE),
                            )
                        ))
                        return
                    }
                    notifyShareIntent(mapOf(
                        "text" to extractShareText(intent),
                        "type" to "text",
                        "meta" to mapOf(
                            "title" to intent.getCharSequenceExtra(Intent.EXTRA_TITLE),
                        )
                    ))`;

    if (content.includes(textSendNeedle)) {
      content = content.replace(textSendNeedle, textSendReplacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(kotlinPath, content);
    console.log("kotlin patched");
  } else {
    console.log("kotlin up to date");
  }
}

function patchKotlinNullType() {
  const kotlinPath = path.join(
    root,
    "node_modules/expo-share-intent/android/src/main/java/expo/modules/shareintent/ExpoShareIntentModule.kt",
  );
  if (!fs.existsSync(kotlinPath)) return;
  let content = fs.readFileSync(kotlinPath, "utf8");
  if (content.includes("VIDEH_SHARE_NULL_TYPE")) {
    console.log("kotlin null-type already patched");
    return;
  }
  const needle = "            if (intent.type == null) return";
  const replacement = `            // VIDEH_SHARE_NULL_TYPE — Google Pay often omits MIME type
            if (intent.type == null) {
                val uris = extractShareUris(intent)
                val sharedText = extractShareText(intent)
                if (uris.isNotEmpty()) {
                    notifyShareIntent(mapOf(
                        "files" to uris.map { getFileInfo(it) },
                        "type" to "file",
                        "text" to sharedText,
                        "meta" to mapOf(
                            "title" to intent.getCharSequenceExtra(Intent.EXTRA_TITLE),
                        )
                    ))
                    return
                }
                if (!sharedText.isNullOrEmpty() && intent.action == Intent.ACTION_SEND) {
                    notifyShareIntent(mapOf(
                        "text" to sharedText,
                        "type" to "text",
                        "meta" to mapOf(
                            "title" to intent.getCharSequenceExtra(Intent.EXTRA_TITLE),
                        )
                    ))
                    return
                }
                return
            }`;
  if (!content.includes(needle)) {
    console.log("kotlin null-type anchor missing");
    return;
  }
  content = content.replace(needle, replacement);
  fs.writeFileSync(kotlinPath, content);
  console.log("kotlin null-type patched");
}

function patchLifecycle() {
  const lifecyclePath = path.join(
    root,
    "node_modules/expo-share-intent/android/src/main/java/expo/modules/shareintent/ExpoShareIntentReactActivityLifecycleListener.kt",
  );
  if (!fs.existsSync(lifecyclePath)) {
    console.log("lifecycle not found, skip");
    return;
  }
  let content = fs.readFileSync(lifecyclePath, "utf8");
  if (content.includes("VIDEH_SHARE_LIFECYCLE")) {
    console.log("lifecycle already patched");
    return;
  }
  content = content.replace(
    `    override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
        // only store when the new intent is not empty
        if (activity?.intent?.type != null) {
            ExpoShareIntentSingleton.intent = activity?.intent
            ExpoShareIntentSingleton.isPending = true
        }
    }`,
    `    override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
        // VIDEH_SHARE_LIFECYCLE — store ACTION_SEND even when MIME type is missing (Google Pay)
        val intent = activity?.intent
        if (intent != null && (
            intent.type != null ||
            intent.action == Intent.ACTION_SEND ||
            intent.action == Intent.ACTION_SEND_MULTIPLE
        )) {
            ExpoShareIntentSingleton.intent = intent
            ExpoShareIntentSingleton.isPending = true
        }
    }`,
  );
  fs.writeFileSync(lifecyclePath, content);
  console.log("lifecycle patched");
}

function patchUtils() {
  const utilsPath = path.join(root, "node_modules/expo-share-intent/build/utils.js");
  if (!fs.existsSync(utilsPath)) {
    console.log("utils not found, skip");
    return;
  }
  let content = fs.readFileSync(utilsPath, "utf8");

  if (!content.includes("videh-share-intent-text-with-files")) {
    content = content.replace(
      "export const parseShareIntent = (value, options) => {",
      `export const parseShareIntent = (value, options) => {
    /* videh-share-intent-text-with-files */`,
    );

    const anchor = "        const isMedia = files.every((file) => file.mimeType.startsWith(\"image/\") ||";
    if (content.includes(anchor)) {
      content = content.replace(
        `            type: isMedia ? "media" : "file",
        };`,
        `            type: isMedia ? "media" : "file",
            text: typeof shareIntent?.text === "string" ? shareIntent.text.trim() || null : null,
            meta: shareIntent?.meta && typeof shareIntent.meta === "object" ? shareIntent.meta : null,
        };`,
      );
    }
  }

  if (!content.includes("videh-share-intent-files-first")) {
    const oldBlock = `    if (shareIntent?.text) {
        // Try to find the webURL in the SharedIntent text
        const webUrl = shareIntent.text
            .match(/[(http(s)?)://(www.)?-a-zA-Z0-9@:%._+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/gi)
            ?.find((link) => link.startsWith("http")) || null;
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            type: webUrl ? "weburl" : "text",
            text: shareIntent.text,
            webUrl,
            meta: {
                title: shareIntent.meta?.title ?? undefined,
            },
        };
    }
    else if (shareIntent?.weburls?.length) {
        const weburl = shareIntent.weburls[0];
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            type: "weburl",
            text: weburl.url, // retrocompatibility
            webUrl: weburl.url,
            meta: parseJson(weburl.meta, {}),
        };
    }
    else {
        // Ensure we got a valid file. some array value are emply
        const files = shareIntent?.files?.filter((file) => file.path || file.contentUri) ||
            [];
        const isMedia = files.every((file) => file.mimeType.startsWith("image/") ||
            file.mimeType.startsWith("video/"));
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            files: shareIntent?.files
                ? shareIntent.files.reduce((acc, file) => {
                    if (!file.path && !file.contentUri)
                        return acc;
                    return [
                        ...acc,
                        {
                            path: file.path ||
                                (file.filePath ? \`file://\${file.filePath}\` : null) ||
                                file.contentUri ||
                                null,
                            mimeType: file.mimeType || null,
                            fileName: file.fileName || null,
                            width: file.width ? Number(file.width) : null,
                            height: file.height ? Number(file.height) : null,
                            size: file.fileSize ? Number(file.fileSize) : null,
                            duration: file.duration ? Number(file.duration) : null,
                        },
                    ];
                }, [])
                : null,
            type: isMedia ? "media" : "file",
            text: typeof shareIntent?.text === "string" ? shareIntent.text.trim() || null : null,
            meta: shareIntent?.meta && typeof shareIntent.meta === "object" ? shareIntent.meta : null,
        };
    }`;

    const newBlock = `    /* videh-share-intent-files-first */
    const rawFiles = shareIntent?.files?.filter((file) => file.path || file.contentUri) || [];
    if (rawFiles.length > 0) {
        const isMedia = rawFiles.every((file) => (file.mimeType || "").startsWith("image/") ||
            (file.mimeType || "").startsWith("video/"));
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            files: shareIntent.files.reduce((acc, file) => {
                if (!file.path && !file.contentUri)
                    return acc;
                return [
                    ...acc,
                    {
                        path: file.path ||
                            (file.filePath ? \`file://\${file.filePath}\` : null) ||
                            file.contentUri ||
                            null,
                        mimeType: file.mimeType || null,
                        fileName: file.fileName || null,
                        width: file.width ? Number(file.width) : null,
                        height: file.height ? Number(file.height) : null,
                        size: file.fileSize ? Number(file.fileSize) : null,
                        duration: file.duration ? Number(file.duration) : null,
                    },
                ];
            }, []),
            type: isMedia ? "media" : "file",
            text: typeof shareIntent?.text === "string" ? shareIntent.text.trim() || null : null,
            meta: shareIntent?.meta && typeof shareIntent.meta === "object" ? shareIntent.meta : null,
        };
    }
    else if (shareIntent?.text) {
        const webUrl = shareIntent.text
            .match(/[(http(s)?)://(www.)?-a-zA-Z0-9@:%._+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/gi)
            ?.find((link) => link.startsWith("http")) || null;
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            type: webUrl ? "weburl" : "text",
            text: shareIntent.text,
            webUrl,
            meta: {
                title: shareIntent.meta?.title ?? undefined,
            },
        };
    }
    else if (shareIntent?.weburls?.length) {
        const weburl = shareIntent.weburls[0];
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            type: "weburl",
            text: weburl.url,
            webUrl: weburl.url,
            meta: parseJson(weburl.meta, {}),
        };
    }`;

    if (content.includes(oldBlock)) {
      content = content.replace(oldBlock, newBlock);
      fs.writeFileSync(utilsPath, content);
      console.log("utils patched (files-first)");
      return;
    }
    console.log("utils files-first anchor missing");
    return;
  }

  console.log("utils up to date");
}

patchKotlin();
patchKotlinNullType();
patchLifecycle();
patchUtils();
