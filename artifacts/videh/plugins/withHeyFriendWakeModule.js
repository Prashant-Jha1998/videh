const {
  withDangerousMod,
  withMainApplication,
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PKG = "com.videh.app";

const HOLDER_KT = `package ${PKG}

import android.content.Context

object HeyFriendWakeHolder {
  private const val PREFS = "videh_hey_friend_wake"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_PENDING_COMMAND = "pending_command"

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
  }

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

  fun setPendingCommand(context: Context, command: String?) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PENDING_COMMAND, command ?: "")
      .apply()
  }

  fun consumePendingCommand(context: Context): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val cmd = prefs.getString(KEY_PENDING_COMMAND, "") ?: ""
    if (cmd.isNotBlank()) {
      prefs.edit().remove(KEY_PENDING_COMMAND).apply()
    }
    return cmd.trim()
  }
}
`;

const BOOT_RECEIVER_KT = `package ${PKG}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class HeyFriendBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!HeyFriendWakeHolder.isEnabled(context)) return
    HeyFriendWakeService.start(context)
  }
}
`;

const SERVICE_KT = `package ${PKG}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class HeyFriendWakeService : Service(), RecognitionListener {
  companion object {
    const val CHANNEL_ID = "videh_hey_friend_wake_svc"
    const val NOTIFICATION_ID = 73821
    const val ACTION_START = "com.videh.app.action.HEY_FRIEND_WAKE_START"
    const val ACTION_STOP = "com.videh.app.action.HEY_FRIEND_WAKE_STOP"

    fun start(context: Context) {
      val intent = Intent(context, HeyFriendWakeService::class.java).apply { action = ACTION_START }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, HeyFriendWakeService::class.java).apply { action = ACTION_STOP }
      context.startService(intent)
    }
  }

  private var speechRecognizer: SpeechRecognizer? = null
  private var listening = false
  private val handler = Handler(Looper.getMainLooper())
  private val restartRunnable = Runnable { startRecognizerLoop() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        promoteForeground()
        scheduleRestart(400)
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    handler.removeCallbacks(restartRunnable)
    destroyRecognizer()
    super.onDestroy()
  }

  private fun promoteForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Videh Assistant",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Listening for Hey Friend even when app is closed"
        setShowBadge(false)
      }
      nm.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = PendingIntent.getActivity(
      this,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Videh Assistant on")
      .setContentText("Say Hey Friend anytime — even when app is closed")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun destroyRecognizer() {
    listening = false
    try {
      speechRecognizer?.cancel()
      speechRecognizer?.destroy()
    } catch (_: Exception) { }
    speechRecognizer = null
  }

  private fun scheduleRestart(delayMs: Long) {
    handler.removeCallbacks(restartRunnable)
    handler.postDelayed(restartRunnable, delayMs)
  }

  private fun startRecognizerLoop() {
    if (!HeyFriendWakeHolder.isEnabled(this)) {
      stopSelf()
      return
    }
    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      scheduleRestart(5000)
      return
    }
    destroyRecognizer()
    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).also {
      it.setRecognitionListener(this)
    }
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
    }
    listening = true
    try {
      speechRecognizer?.startListening(intent)
    } catch (_: Exception) {
      scheduleRestart(2000)
    }
  }

  private fun onWakeDetected(fullText: String) {
    val command = HeyFriendWakePhrase.extractCommand(fullText)
    HeyFriendWakeHolder.setPendingCommand(this, command)
    wakeApp(command)
    emitToReact(command)
  }

  private fun wakeApp(command: String) {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP,
      )
      putExtra("videh_hey_friend_wake", true)
      putExtra("videh_hey_friend_command", command)
    } ?: return
    try {
      startActivity(launch)
    } catch (_: Exception) { }
  }

  private fun emitToReact(command: String) {
    try {
      val app = application as? ReactApplication ?: return
      val manager = app.reactNativeHost.reactInstanceManager
      val context = manager.currentReactContext ?: return
      val payload = Arguments.createMap().apply { putString("command", command) }
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("VidehHeyFriendWake", payload)
    } catch (_: Exception) { }
  }

  override fun onReadyForSpeech(params: Bundle?) {}
  override fun onBeginningOfSpeech() {}
  override fun onRmsChanged(rmsdB: Float) {}
  override fun onBufferReceived(buffer: ByteArray?) {}
  override fun onEndOfSpeech() {}

  override fun onError(error: Int) {
    listening = false
    scheduleRestart(if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) 8000 else 1200)
  }

  override fun onResults(results: Bundle?) {
    listening = false
    val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
    for (text in texts) {
      if (HeyFriendWakePhrase.containsWake(text)) {
        onWakeDetected(text)
        scheduleRestart(1800)
        return
      }
    }
    scheduleRestart(300)
  }

  override fun onPartialResults(partialResults: Bundle?) {
    val texts = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
    for (text in texts) {
      if (HeyFriendWakePhrase.containsWake(text)) {
        onWakeDetected(text)
        try { speechRecognizer?.cancel() } catch (_: Exception) { }
        listening = false
        scheduleRestart(1800)
        return
      }
    }
  }

  override fun onEvent(eventType: Int, params: Bundle?) {}
}
`;

const PHRASE_KT = `package ${PKG}

object HeyFriendWakePhrase {
  private val phrases = listOf(
    "hey friend",
    "he friend",
    "hay friend",
    "hi friend",
    "hello friend",
    "hey frnd",
    "hey frend",
    "hey friends",
    "oye friend",
    "hey fren",
    "हे फ्रेंड",
    "हाय फ्रेंड",
    "हे दोस्त",
  ).sortedByDescending { it.length }

  fun containsWake(text: String): Boolean {
    val n = text.lowercase().trim()
    if (n.isBlank()) return false
    if (phrases.any { n.contains(it) }) return true
    val hasHey = Regex("\\\\b(hey|he|hay|hi|hello|oye)\\\\b").containsMatchIn(n)
    val hasFriend = Regex("\\\\b(friend|friends|frnd|frend|fren|फ्रेंड|दोस्त)\\\\b").containsMatchIn(n)
    return hasHey && hasFriend
  }

  fun extractCommand(text: String): String {
    var raw = text.trim()
    if (raw.isBlank()) return ""
    val lower = raw.lowercase()
    for (phrase in phrases) {
      val idx = lower.indexOf(phrase)
      if (idx >= 0) {
        raw = raw.substring(idx + phrase.length).trim()
        break
      }
    }
    raw = raw.replace(Regex("^[,.\\\\s]+"), "").trim()
    return raw
  }
}
`;

const MODULE_KT = `package ${PKG}

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class HeyFriendWakeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "HeyFriendWake"

  @ReactMethod
  fun addListener(eventName: String?) { /* RN EventEmitter */ }

  @ReactMethod
  fun removeListeners(count: Int) { /* RN EventEmitter */ }

  @ReactMethod
  fun setWakeServiceEnabled(enabled: Boolean) {
    HeyFriendWakeHolder.setEnabled(reactContext, enabled)
    if (enabled) {
      HeyFriendWakeService.start(reactContext)
    } else {
      HeyFriendWakeService.stop(reactContext)
      HeyFriendWakeHolder.setPendingCommand(reactContext, null)
    }
  }

  @ReactMethod
  fun startWakeService() {
    HeyFriendWakeHolder.setEnabled(reactContext, true)
    HeyFriendWakeService.start(reactContext)
  }

  @ReactMethod
  fun stopWakeService() {
    HeyFriendWakeService.stop(reactContext)
  }

  @ReactMethod
  fun getPendingWake(promise: Promise) {
    try {
      val activity = reactContext.currentActivity
      var command = ""
      val intent = activity?.intent
      if (intent?.getBooleanExtra("videh_hey_friend_wake", false) == true) {
        command = intent.getStringExtra("videh_hey_friend_command") ?: ""
        intent.removeExtra("videh_hey_friend_wake")
        intent.removeExtra("videh_hey_friend_command")
      }
      if (command.isBlank()) {
        command = HeyFriendWakeHolder.consumePendingCommand(reactContext)
      }
      promise.resolve(command)
    } catch (e: Exception) {
      promise.reject("ERR_WAKE", e.message, e)
    }
  }
}
`;

const PACKAGE_KT = `package ${PKG}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class HeyFriendWakePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(HeyFriendWakeModule(reactContext))
  }
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pkgDir(projectRoot) {
  return path.join(projectRoot, "android", "app", "src", "main", "java", "com", "videh", "app");
}

const withHeyFriendWakeModule = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    AndroidConfig.Permissions.ensurePermissions(manifest, [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MICROPHONE",
      "android.permission.RECORD_AUDIO",
      "android.permission.WAKE_LOCK",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ]);

    const app = manifest.manifest?.application?.[0];
    if (!app) return cfg;

    app.service = app.service ?? [];
    const serviceName = ".HeyFriendWakeService";
    if (!app.service.some((s) => String(s.$?.["android:name"] ?? "").includes("HeyFriendWakeService"))) {
      app.service.push({
        $: {
          "android:name": serviceName,
          "android:exported": "false",
          "android:foregroundServiceType": "microphone",
          "android:stopWithTask": "false",
        },
      });
    }

    app.receiver = app.receiver ?? [];
    const receiverName = ".HeyFriendBootReceiver";
    if (!app.receiver.some((r) => String(r.$?.["android:name"] ?? "").includes("HeyFriendBootReceiver"))) {
      app.receiver.push({
        $: {
          "android:name": receiverName,
          "android:exported": "false",
          "android:enabled": "true",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.BOOT_COMPLETED" } }],
          },
        ],
      });
    }

    for (const activity of app.activity ?? []) {
      const name = String(activity.$?.["android:name"] ?? "");
      if (name.endsWith("MainActivity")) {
        activity.$["android:showWhenLocked"] = "true";
        activity.$["android:turnScreenOn"] = "true";
        activity.$["android:launchMode"] = "singleTop";
      }
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const dir = pkgDir(cfg.modRequest.projectRoot);
      ensureDir(dir);
      const files = {
        "HeyFriendWakeHolder.kt": HOLDER_KT,
        "HeyFriendWakePhrase.kt": PHRASE_KT,
        "HeyFriendWakeService.kt": SERVICE_KT,
        "HeyFriendBootReceiver.kt": BOOT_RECEIVER_KT,
        "HeyFriendWakeModule.kt": MODULE_KT,
        "HeyFriendWakePackage.kt": PACKAGE_KT,
      };
      for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content);
      }
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes("HeyFriendWakePackage")) return cfg;
    if (contents.includes("packages.add")) {
      contents = contents.replace(
        /packages\.add\(/,
        "packages.add(HeyFriendWakePackage())\n            packages.add(",
      );
    } else if (contents.includes("PackageList")) {
      contents = contents.replace(
        /val packages = PackageList\(this\)\.packages/,
        "val packages = PackageList(this).packages.apply { add(HeyFriendWakePackage()) }",
      );
    }
    if (!contents.includes("import com.videh.app.HeyFriendWakePackage")) {
      contents = contents.replace(/^package .+\n/, (m) => `${m}import com.videh.app.HeyFriendWakePackage\n`);
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
};

module.exports = createRunOncePlugin(withHeyFriendWakeModule, "with-hey-friend-wake-module", "1.0.0");
