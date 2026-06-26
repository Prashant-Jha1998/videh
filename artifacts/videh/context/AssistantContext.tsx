import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Keyboard, Platform } from "react-native";
import { useApp } from "./AppContext";
import {
  fetchAssistantPrefs,
  patchAssistantPrefs,
  runAssistantCommand,
  type AssistantCommandResult,
} from "@/lib/assistantApi";
import { isAffirmative, isNegative, isSessionExit } from "@/lib/assistantConfirm";
import { tryLocalAssistantCommand } from "@/lib/assistantLocal";
import { shouldPauseAssistantListening, setAssistantChatInputFocused, setAssistantKeyboardVisible } from "@/lib/assistantPause";
import { wakeListenPrompt } from "@/lib/assistantGreeting";
import {
  detectLocaleFromTranscript,
  normalizeLangCode,
  type AssistantLangCode,
} from "@/lib/assistantLanguages";
import {
  getLocalAssistantPrefs,
  parseWakeUtterance,
  setLocalAssistantPrefs,
  stripWakeFromCommand,
  type AssistantPrefs,
} from "@/lib/assistantPrefs";
import {
  destroySpeech,
  isSpeechRecognitionAvailable,
  speakAssistant,
  startListening,
  stopListening,
  stopSpeaking,
} from "@/lib/assistantSpeech";
import { HEY_VIDeh_ENABLED } from "@/lib/heyVidehFeature";

type AssistantPhase = "idle" | "listening" | "wake" | "active" | "processing" | "speaking";

type AssistantContextType = {
  prefs: AssistantPrefs | null;
  phase: AssistantPhase;
  transcript: string;
  lastResponse: string;
  lastError: string | null;
  activeLang: AssistantLangCode;
  refreshPrefs: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  activateManually: () => Promise<void>;
  dismiss: () => void;
};

const AssistantContext = createContext<AssistantContextType | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, chats } = useApp();
  const router = useRouter();
  const [prefs, setPrefs] = useState<AssistantPrefs | null>(null);
  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<AssistantLangCode>("en");
  const listeningRef = useRef(false);
  const phaseRef = useRef<AssistantPhase>("idle");
  const commandBufferRef = useRef("");
  const pendingWakeCommandRef = useRef("");
  const listenLocaleRef = useRef<AssistantLangCode>("en");
  const prefsRef = useRef<AssistantPrefs | null>(null);
  const wakeRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandSubmittedRef = useRef(false);
  const activatingRef = useRef(false);
  const pendingCallRef = useRef<{
    chatId: string;
    callType: "audio" | "video";
    contactName: string;
  } | null>(null);
  const submitBufferedCommandRef = useRef<() => void>(() => {});
  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const setPhaseSafe = useCallback((p: AssistantPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const persistLang = useCallback(async (lang: AssistantLangCode) => {
    setActiveLang(lang);
    listenLocaleRef.current = lang;
    await setLocalAssistantPrefs({ lastLangCode: lang });
  }, []);

  const refreshPrefs = useCallback(async () => {
    if (!user?.sessionToken) return;
    const local = await getLocalAssistantPrefs();
    let p = await fetchAssistantPrefs(user.sessionToken);
    if (!p) {
      p = {
        enabled: local.enabled ?? true,
        voiceEnrolled: false,
        listenWhenLocked: local.listenWhenLocked ?? true,
        userName: user.name ?? "User",
        lastLangCode: local.lastLangCode ?? "en",
      };
    }
    // Default ON unless user explicitly turned off in Settings (local.enabled === false).
    const enabled = local.enabled === false ? false : true;
    if (enabled && !p.enabled && user.sessionToken) {
      void patchAssistantPrefs(user.sessionToken, { enabled: true });
      p = { ...p, enabled: true };
    }
    const finalPrefs: AssistantPrefs = {
      ...p,
      enabled,
      listenWhenLocked: p.listenWhenLocked ?? local.listenWhenLocked ?? true,
      lastLangCode: p.lastLangCode ?? local.lastLangCode ?? "en",
    };
    setPrefs(finalPrefs);
    listenLocaleRef.current = finalPrefs.lastLangCode ?? "hi";
    setActiveLang(finalPrefs.lastLangCode ?? "hi");
    await setLocalAssistantPrefs(finalPrefs);
  }, [user?.sessionToken, user?.name]);

  useEffect(() => {
    if (isAuthenticated && user?.sessionToken) void refreshPrefs();
  }, [isAuthenticated, user?.sessionToken, refreshPrefs]);

  const dismiss = useCallback(() => {
    commandBufferRef.current = "";
    pendingWakeCommandRef.current = "";
    pendingCallRef.current = null;
    setTranscript("");
    setLastError(null);
    if (commandTimerRef.current) clearTimeout(commandTimerRef.current);
    if (commandSubmitTimerRef.current) clearTimeout(commandSubmitTimerRef.current);
    commandSubmittedRef.current = false;
    void stopListening();
    void stopSpeaking();
    setPhaseSafe("idle");
    listeningRef.current = false;
  }, [setPhaseSafe]);

  const runAssistantActions = useCallback((result: AssistantCommandResult) => {
    const openChat = result.actions?.find((a) => a.type === "open_chat" && a.chatId);
    if (openChat?.chatId) {
      router.push({ pathname: "/chat/[id]", params: { id: openChat.chatId } });
    }
    const startCall = result.actions?.find((a) => a.type === "start_call" && a.chatId);
    if (startCall?.chatId) {
      router.push({
        pathname: "/call/[id]",
        params: {
          id: startCall.chatId,
          type: startCall.callType ?? "audio",
          name: startCall.contactName ?? "",
        },
      });
    }
    const openKhata = result.actions?.find((a) => a.type === "open_khata" && a.chatId);
    if (openKhata?.chatId) {
      router.push({ pathname: "/khata/[chatId]", params: { chatId: openKhata.chatId } });
    }
    if (result.actions?.some((a) => a.type === "open_broadcasts")) {
      router.push("/broadcasts");
    }
    if (result.actions?.some((a) => a.type === "open_calls_tab")) {
      router.push("/(tabs)/calls");
    }
  }, [router]);

  const beginCommandListening = useCallback(async () => {
    setPhaseSafe("listening");
    setTranscript("");
    commandBufferRef.current = "";
    commandSubmittedRef.current = false;

    await startListening({
      locale: listenLocaleRef.current,
      onPartial: (t: string) => {
        setTranscript(t);
        commandBufferRef.current = t;
        const detected = detectLocaleFromTranscript(t);
        if (detected !== listenLocaleRef.current) {
          listenLocaleRef.current = detected;
        }
      },
      onFinal: (t: string) => {
        commandBufferRef.current = t;
        listenLocaleRef.current = detectLocaleFromTranscript(t);
        if (commandSubmitTimerRef.current) clearTimeout(commandSubmitTimerRef.current);
        commandSubmitTimerRef.current = setTimeout(() => submitBufferedCommandRef.current(), 650);
      },
      onError: (msg) => {
        setLastError(msg);
      },
      onEnd: () => {
        if (commandSubmitTimerRef.current) clearTimeout(commandSubmitTimerRef.current);
        commandSubmitTimerRef.current = setTimeout(() => submitBufferedCommandRef.current(), 320);
      },
    });

    if (commandTimerRef.current) clearTimeout(commandTimerRef.current);
    commandTimerRef.current = setTimeout(() => submitBufferedCommandRef.current(), 14_000);
  }, [setPhaseSafe]);

  const continueConversation = useCallback(async (speakText: string, lang: AssistantLangCode) => {
    setLastResponse(speakText);
    setPhaseSafe("speaking");
    await speakAssistant(speakText, lang);
    await beginCommandListening();
  }, [setPhaseSafe, beginCommandListening]);

  const handleCommand = useCallback(async (text: string) => {
    const cleaned = stripWakeFromCommand(text.trim());

    if (isSessionExit(cleaned)) {
      const bye = "Okay. Say Hey Videh anytime.";
      setLastResponse(bye);
      setPhaseSafe("speaking");
      await speakAssistant(bye, "en");
      dismiss();
      return;
    }

    const pendingCall = pendingCallRef.current;
    if (pendingCall) {
      if (isAffirmative(cleaned)) {
        pendingCallRef.current = null;
        const done = `Calling ${pendingCall.contactName} now.`;
        runAssistantActions({
          speak: done,
          actions: [{
            type: "start_call",
            chatId: pendingCall.chatId,
            callType: pendingCall.callType,
            contactName: pendingCall.contactName,
          }],
        });
        await continueConversation(`${done} Anything else?`, "en");
        return;
      }
      if (isNegative(cleaned)) {
        pendingCallRef.current = null;
        await continueConversation("Call cancelled. Anything else?", "en");
        return;
      }
      const clarify = `Say yes to call ${pendingCall.contactName}, or no to cancel.`;
      await continueConversation(clarify, "en");
      return;
    }

    if (!user?.sessionToken || !cleaned) {
      const hint = "I did not catch that. Ask anything about your chats, calls, or the Videh app.";
      await continueConversation(hint, "en");
      return;
    }

    setLastError(null);
    const langHint = detectLocaleFromTranscript(cleaned);
    listenLocaleRef.current = langHint;

    await stopSpeaking();
    setPhaseSafe("processing");
    try {
      const local = tryLocalAssistantCommand(cleaned, chatsRef.current);
      const result = local ?? await runAssistantCommand(user.sessionToken, cleaned, langHint);
      const replyLang = normalizeLangCode(result.langCode ?? langHint);
      await persistLang(replyLang);

      const startCall = result.actions?.find((a) => a.type === "start_call" && a.chatId);
      if (startCall?.chatId) {
        pendingCallRef.current = {
          chatId: startCall.chatId,
          callType: (startCall.callType === "video" ? "video" : "audio"),
          contactName: startCall.contactName ?? "contact",
        };
        const confirm = `Should I call ${pendingCallRef.current.contactName}? Say yes to confirm or no to cancel.`;
        await continueConversation(confirm, "en");
        return;
      }

      const speakLine = `${result.speak} Anything else?`;
      setLastResponse(speakLine);
      setPhaseSafe("speaking");
      runAssistantActions(result);
      await speakAssistant(speakLine, result.speechLocale ?? replyLang);
      await beginCommandListening();
    } catch {
      await continueConversation("Sorry, I could not process that. Try again.", "en");
    }
  }, [
    user?.sessionToken,
    setPhaseSafe,
    dismiss,
    persistLang,
    runAssistantActions,
    continueConversation,
    beginCommandListening,
  ]);

  const submitBufferedCommand = useCallback(() => {
    if (commandSubmittedRef.current || phaseRef.current !== "listening") return;
    commandSubmittedRef.current = true;
    if (commandTimerRef.current) clearTimeout(commandTimerRef.current);
    if (commandSubmitTimerRef.current) clearTimeout(commandSubmitTimerRef.current);
    void stopListening();
    const cmd = stripWakeFromCommand(commandBufferRef.current.trim());
    if (cmd) void handleCommand(cmd);
    else {
      const prompt = "Yes? What should I do?";
      void continueConversation(prompt, "en");
    }
  }, [handleCommand, continueConversation]);

  submitBufferedCommandRef.current = submitBufferedCommand;

  const activateAssistant = useCallback(async (inlineCommand?: string) => {
    if (!HEY_VIDeh_ENABLED) return;
    if (!user?.sessionToken) {
      setLastError("Please sign in again to use Hey Videh.");
      return;
    }
    const lang = prefs?.lastLangCode ?? "en";
    listenLocaleRef.current = lang;
    setActiveLang(lang);
    setLastError(null);

    const preCommand = stripWakeFromCommand(
      (inlineCommand ?? pendingWakeCommandRef.current ?? "").trim(),
    );
    pendingWakeCommandRef.current = "";

    if (preCommand) {
      setPhaseSafe("processing");
      await handleCommand(preCommand);
      return;
    }

    const ack = wakeListenPrompt(lang);
    setLastResponse(ack);
    setPhaseSafe("speaking");
    await speakAssistant(ack, lang);

    await beginCommandListening();
  }, [
    user?.sessionToken,
    user?.name,
    prefs?.userName,
    prefs?.lastLangCode,
    setPhaseSafe,
    handleCommand,
    beginCommandListening,
  ]);

  const scheduleWakeRestart = useCallback((delayMs = 900) => {
    if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current);
    wakeRestartTimerRef.current = setTimeout(() => {
      wakeRestartTimerRef.current = null;
      if (phaseRef.current !== "idle") return;
      if (!prefsRef.current?.enabled) return;
      if (shouldPauseAssistantListening()) return;
      void startWakeListeningRef.current();
    }, delayMs);
  }, []);

  const tryWakeActivationRef = useRef<(inlineCommand?: string) => Promise<void>>(async () => {});

  const tryWakeActivation = useCallback(async (inlineCommand?: string) => {
    if (!prefsRef.current?.enabled) {
      setLastError("Hey Videh is off. Settings → Hey Videh → enable it.");
      return;
    }
    if (!user?.sessionToken || phaseRef.current !== "idle" || activatingRef.current) return;
    if (!isSpeechRecognitionAvailable()) {
      setLastError("Speech recognition is not available on this device. Use the Videh Android/iOS app.");
      return;
    }
    activatingRef.current = true;
    listeningRef.current = false;
    await stopListening();
    try {
      await activateAssistant(inlineCommand);
    } finally {
      activatingRef.current = false;
    }
  }, [user?.sessionToken, activateAssistant]);

  tryWakeActivationRef.current = tryWakeActivation;

  const wakeBufferRef = useRef("");

  const onWakeTranscript = useCallback((text: string) => {
    const chunk = text.trim();
    if (!chunk) return;
    wakeBufferRef.current = `${wakeBufferRef.current} ${chunk}`.trim().slice(-240);
    const { hasWake, command } = parseWakeUtterance(wakeBufferRef.current);
    if (!hasWake) return;
    wakeBufferRef.current = "";
    pendingWakeCommandRef.current = command;
    void tryWakeActivationRef.current(command);
  }, []);

  const startWakeListeningRef = useRef<() => Promise<void>>(async () => {});

  const startWakeListening = useCallback(async () => {
    if (!HEY_VIDeh_ENABLED) return;
    const p = prefsRef.current;
    if (!p?.enabled || !isSpeechRecognitionAvailable()) return;
    if (phaseRef.current !== "idle") return;
    if (shouldPauseAssistantListening()) return;
    if (activatingRef.current) return;

    if (listeningRef.current) {
      await stopListening();
      listeningRef.current = false;
    }

    try {
      await startListening({
        locale: p.lastLangCode ?? "en",
        wakeMode: true,
        onPartial: (text: string) => {
          if (phaseRef.current !== "idle") return;
          onWakeTranscript(text);
        },
        onFinal: (text: string) => {
          if (phaseRef.current !== "idle") return;
          onWakeTranscript(text);
        },
        onError: (msg) => {
          listeningRef.current = false;
          setLastError(msg);
          scheduleWakeRestart(2000);
        },
        onEnd: () => {
          listeningRef.current = false;
          wakeBufferRef.current = "";
          scheduleWakeRestart(1000);
        },
      });
      listeningRef.current = true;
    } catch (e: unknown) {
      listeningRef.current = false;
      setLastError(e instanceof Error ? e.message : "Could not start Hey Videh listening.");
      scheduleWakeRestart(3000);
    }
  }, [onWakeTranscript, scheduleWakeRestart, setPhaseSafe]);

  startWakeListeningRef.current = startWakeListening;

  useEffect(() => {
    if (!HEY_VIDeh_ENABLED) {
      void stopListening();
      listeningRef.current = false;
      if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current);
      return;
    }
    if (!isAuthenticated || !prefs?.enabled) {
      void stopListening();
      listeningRef.current = false;
      if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current);
      return;
    }
    if (Platform.OS === "web") return;

    const shouldListenInAppState = (state: string) => {
      if (state === "active") return true;
      if (prefsRef.current?.listenWhenLocked && state === "background") return true;
      return false;
    };

    const restart = () => {
      if (shouldListenInAppState(AppState.currentState) && !shouldPauseAssistantListening()) {
        void startWakeListening();
      }
    };

    restart();
    const appSub = AppState.addEventListener("change", (state) => {
      if (shouldListenInAppState(state)) {
        restart();
      } else {
        void stopListening();
        listeningRef.current = false;
      }
    });
    const kbShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setAssistantKeyboardVisible(true);
        void stopListening();
        listeningRef.current = false;
      },
    );
    const kbHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setAssistantKeyboardVisible(false);
        if (AppState.currentState === "active") restart();
      },
    );
    const timer = setInterval(restart, 12_000);

    return () => {
      clearInterval(timer);
      if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current);
      if (commandSubmitTimerRef.current) clearTimeout(commandSubmitTimerRef.current);
      appSub.remove();
      kbShow.remove();
      kbHide.remove();
      void stopListening();
      void destroySpeech();
      listeningRef.current = false;
    };
  }, [isAuthenticated, prefs?.enabled, prefs?.listenWhenLocked, startWakeListening]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!user?.sessionToken) return;
    await patchAssistantPrefs(user.sessionToken, { enabled });
    await setLocalAssistantPrefs({ enabled: enabled ? true : false });
    await refreshPrefs();
    if (enabled && Platform.OS !== "web") {
      setTimeout(() => void startWakeListeningRef.current(), 400);
    }
  }, [user?.sessionToken, refreshPrefs]);

  const activateManually = useCallback(async () => {
    await activateAssistant();
  }, [activateAssistant]);

  return (
    <AssistantContext.Provider value={{
      prefs,
      phase,
      transcript,
      lastResponse,
      lastError,
      activeLang,
      refreshPrefs,
      setEnabled,
      activateManually,
      dismiss,
    }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}
