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
  fetchAssistantGreeting,
  fetchAssistantPrefs,
  patchAssistantPrefs,
  runAssistantCommand,
} from "@/lib/assistantApi";
import { shouldPauseAssistantListening, setAssistantChatInputFocused, setAssistantKeyboardVisible } from "@/lib/assistantPause";
import { localActivationGreeting } from "@/lib/assistantGreeting";
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
  const { user, isAuthenticated } = useApp();
  const router = useRouter();
  const [prefs, setPrefs] = useState<AssistantPrefs | null>(null);
  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<AssistantLangCode>("hi");
  const listeningRef = useRef(false);
  const phaseRef = useRef<AssistantPhase>("idle");
  const commandBufferRef = useRef("");
  const pendingWakeCommandRef = useRef("");
  const listenLocaleRef = useRef<AssistantLangCode>("hi");
  const prefsRef = useRef<AssistantPrefs | null>(null);
  const wakeRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activatingRef = useRef(false);

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
        lastLangCode: local.lastLangCode ?? "hi",
      };
    } else {
      const shouldEnable = local.enabled !== false && (p.voiceEnrolled || local.enabled === true);
      if (!p.enabled && shouldEnable) {
        await patchAssistantPrefs(user.sessionToken, { enabled: true });
        p = { ...p, enabled: true };
      }
    }
    const finalPrefs: AssistantPrefs = {
      ...p,
      enabled: p.enabled ?? local.enabled ?? true,
      listenWhenLocked: p.listenWhenLocked ?? local.listenWhenLocked ?? true,
      lastLangCode: p.lastLangCode ?? local.lastLangCode ?? "hi",
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
    setTranscript("");
    setLastError(null);
    if (commandTimerRef.current) clearTimeout(commandTimerRef.current);
    void stopListening();
    void stopSpeaking();
    setPhaseSafe("idle");
    listeningRef.current = false;
  }, [setPhaseSafe]);

  const handleCommand = useCallback(async (text: string) => {
    const cleaned = stripWakeFromCommand(text.trim());
    if (!user?.sessionToken || !cleaned) {
      const hint = listenLocaleRef.current === "en"
        ? "I did not catch that. Say anything: call or message someone from your chats, who messaged today, missed calls, group messages, or how to use a setting."
        : "Command samajh nahi aaya. Apni chat list ke kisi naam se call/message bolein, ya poochhiye: aaj kis ka message aaya, missed call, group messages, setting kaise badlein.";
      setLastError(hint);
      setLastResponse(hint);
      setPhaseSafe("speaking");
      await speakAssistant(hint, listenLocaleRef.current);
      dismiss();
      return;
    }

    setLastError(null);
    const guessed = detectLocaleFromTranscript(cleaned);
    const langHint = listenLocaleRef.current !== "hi" ? listenLocaleRef.current : guessed;

    setPhaseSafe("processing");
    try {
      const result = await runAssistantCommand(user.sessionToken, cleaned, langHint);
      const lang = normalizeLangCode(result.langCode ?? langHint);
      await persistLang(lang);

      setLastResponse(result.speak);
      setPhaseSafe("speaking");
      await speakAssistant(result.speak, result.speechLocale ?? lang);

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
    } catch {
      const err = listenLocaleRef.current === "en"
        ? "Sorry, I could not process that command."
        : "Sorry, that command could not be processed right now.";
      setLastResponse(err);
      await speakAssistant(err, listenLocaleRef.current);
    } finally {
      dismiss();
    }
  }, [user?.sessionToken, setPhaseSafe, dismiss, router, persistLang]);

  const activateAssistant = useCallback(async (inlineCommand?: string) => {
    if (!user?.sessionToken) {
      setLastError("Please sign in again to use Hey Videh.");
      return;
    }
    const userDbId = user.dbId ?? Number(user.id);
    const lang = prefs?.lastLangCode ?? "hi";
    listenLocaleRef.current = lang;
    setActiveLang(lang);
    setLastError(null);

    const preCommand = stripWakeFromCommand(
      (inlineCommand ?? pendingWakeCommandRef.current ?? "").trim(),
    );
    pendingWakeCommandRef.current = "";

    setPhaseSafe("active");
    const displayName = prefs?.userName || user.name || "User";
    let greeting = localActivationGreeting(displayName, lang);
    let speechLocale: string | undefined;
    if (userDbId && Number.isFinite(userDbId)) {
      try {
        const g = await fetchAssistantGreeting(user.sessionToken, userDbId, lang);
        greeting = g.speak;
        if (g.langCode) await persistLang(normalizeLangCode(g.langCode));
        speechLocale = g.speechLocale;
      } catch { /* local fallback */ }
    }

    setLastResponse(greeting);
    setPhaseSafe("speaking");
    await speakAssistant(greeting, speechLocale ?? lang);

    if (preCommand) {
      await handleCommand(preCommand);
      return;
    }

    setPhaseSafe("listening");
    setTranscript("");
    commandBufferRef.current = "";

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
      },
      onError: (msg) => {
        setLastError(msg);
      },
    });

    if (commandTimerRef.current) clearTimeout(commandTimerRef.current);
    commandTimerRef.current = setTimeout(() => {
      void stopListening();
      const cmd = stripWakeFromCommand(commandBufferRef.current.trim());
      if (cmd) void handleCommand(cmd);
      else {
        const prompt = lang === "en"
          ? "Yes? What should I do?"
          : "Haan, bataiye — kya karna hai?";
        setLastResponse(prompt);
        setPhaseSafe("speaking");
        void speakAssistant(prompt, lang).then(() => dismiss());
      }
    }, 18000);
  }, [
    user?.sessionToken,
    user?.dbId,
    user?.id,
    user?.name,
    prefs?.userName,
    prefs?.lastLangCode,
    setPhaseSafe,
    handleCommand,
    dismiss,
    persistLang,
  ]);

  const scheduleWakeRestart = useCallback((delayMs = 350) => {
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
    if (!user?.sessionToken || phaseRef.current !== "idle" || activatingRef.current) return;
    if (!isSpeechRecognitionAvailable()) {
      setLastError("Speech recognition is not available on this device.");
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

  const onWakeTranscript = useCallback((text: string) => {
    const { hasWake, command } = parseWakeUtterance(text);
    if (!hasWake) return;
    pendingWakeCommandRef.current = command;
    void tryWakeActivationRef.current(command);
  }, []);

  const startWakeListeningRef = useRef<() => Promise<void>>(async () => {});

  const startWakeListening = useCallback(async () => {
    const p = prefsRef.current;
    if (!p?.enabled || !isSpeechRecognitionAvailable()) return;
    if (phaseRef.current !== "idle") return;
    if (shouldPauseAssistantListening()) return;
    if (activatingRef.current) return;

    if (listeningRef.current) {
      await stopListening();
      listeningRef.current = false;
    }

    listeningRef.current = true;
    await startListening({
      locale: p.lastLangCode ?? "hi",
      wakeMode: true,
      onPartial: (text: string) => {
        if (phaseRef.current !== "idle") return;
        onWakeTranscript(text);
      },
      onFinal: (text: string) => {
        if (phaseRef.current !== "idle") return;
        onWakeTranscript(text);
      },
      onError: () => {
        listeningRef.current = false;
        scheduleWakeRestart(1200);
      },
      onEnd: () => {
        listeningRef.current = false;
        scheduleWakeRestart(400);
      },
    });
  }, [onWakeTranscript, scheduleWakeRestart]);

  startWakeListeningRef.current = startWakeListening;

  useEffect(() => {
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
    const timer = setInterval(restart, 4000);

    return () => {
      clearInterval(timer);
      if (wakeRestartTimerRef.current) clearTimeout(wakeRestartTimerRef.current);
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
    await setLocalAssistantPrefs({ enabled });
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
