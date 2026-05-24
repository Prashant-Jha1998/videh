import { useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { useApp } from "./AppContext";
import {
  fetchAssistantGreeting,
  fetchAssistantPrefs,
  patchAssistantPrefs,
  runAssistantCommand,
} from "@/lib/assistantApi";
import { localActivationGreeting } from "@/lib/assistantGreeting";
import {
  detectLocaleFromTranscript,
  normalizeLangCode,
  type AssistantLangCode,
} from "@/lib/assistantLanguages";
import {
  containsWakePhrase,
  getLocalAssistantPrefs,
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
  const [activeLang, setActiveLang] = useState<AssistantLangCode>("hi");
  const listeningRef = useRef(false);
  const phaseRef = useRef<AssistantPhase>("idle");
  const commandBufferRef = useRef("");
  const listenLocaleRef = useRef<AssistantLangCode>("hi");

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
    const p = await fetchAssistantPrefs(user.sessionToken);
    if (p) {
      const local = await getLocalAssistantPrefs();
      const finalPrefs: AssistantPrefs = {
        ...p,
        lastLangCode: p.lastLangCode ?? local.lastLangCode ?? "hi",
      };
      setPrefs(finalPrefs);
      listenLocaleRef.current = finalPrefs.lastLangCode ?? "hi";
      setActiveLang(finalPrefs.lastLangCode ?? "hi");
      await setLocalAssistantPrefs(finalPrefs);
    }
  }, [user?.sessionToken]);

  useEffect(() => {
    if (isAuthenticated && user?.sessionToken) void refreshPrefs();
  }, [isAuthenticated, user?.sessionToken, refreshPrefs]);

  const dismiss = useCallback(() => {
    commandBufferRef.current = "";
    setTranscript("");
    void stopListening();
    void stopSpeaking();
    setPhaseSafe("idle");
    listeningRef.current = false;
  }, [setPhaseSafe]);

  const handleCommand = useCallback(async (text: string) => {
    const cleaned = stripWakeFromCommand(text.trim());
    if (!user?.sessionToken || !cleaned) return;

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
        : "Maaf kijiye, abhi ye command process nahi ho payi.";
      setLastResponse(err);
      await speakAssistant(err, listenLocaleRef.current);
    } finally {
      dismiss();
    }
  }, [user?.sessionToken, setPhaseSafe, dismiss, router, persistLang]);

  const activateAssistant = useCallback(async () => {
    if (!user?.sessionToken || !user.dbId) return;
    const lang = prefs?.lastLangCode ?? "hi";
    listenLocaleRef.current = lang;
    setActiveLang(lang);

    setPhaseSafe("active");
    const displayName = prefs?.userName || user.name || "User";
    let greeting = localActivationGreeting(displayName, lang);
    let speechLocale: string | undefined;
    try {
      const g = await fetchAssistantGreeting(user.sessionToken, user.dbId, lang);
      greeting = g.speak;
      if (g.langCode) await persistLang(normalizeLangCode(g.langCode));
      speechLocale = g.speechLocale;
    } catch { /* local fallback */ }

    setLastResponse(greeting);
    setPhaseSafe("speaking");
    await speakAssistant(greeting, speechLocale ?? lang);
    setPhaseSafe("listening");
    setTranscript("");
    commandBufferRef.current = "";

    await startListening({
      locale: listenLocaleRef.current,
      onPartial: (t) => {
        setTranscript(t);
        const detected = detectLocaleFromTranscript(t);
        if (detected !== listenLocaleRef.current) {
          listenLocaleRef.current = detected;
        }
      },
      onFinal: (t) => {
        commandBufferRef.current = t;
        listenLocaleRef.current = detectLocaleFromTranscript(t);
      },
      onError: () => {},
    });
    setTimeout(() => {
      void stopListening();
      const cmd = commandBufferRef.current.trim() || transcript.trim();
      if (cmd) void handleCommand(cmd);
      else dismiss();
    }, 14000);
  }, [
    user?.sessionToken,
    user?.dbId,
    user?.name,
    prefs?.userName,
    prefs?.lastLangCode,
    setPhaseSafe,
    handleCommand,
    dismiss,
    transcript,
    persistLang,
  ]);

  const tryWakeActivation = useCallback(async () => {
    if (!user?.sessionToken || phaseRef.current !== "idle") return;
    listeningRef.current = false;
    await stopListening();
    await activateAssistant();
  }, [user?.sessionToken, activateAssistant]);

  const startWakeListening = useCallback(async () => {
    if (!prefs?.enabled || !prefs.voiceEnrolled || !isSpeechRecognitionAvailable()) return;
    if (phaseRef.current !== "idle") return;

    if (listeningRef.current) {
      await stopListening();
      listeningRef.current = false;
    }

    listeningRef.current = true;
    await startListening({
      locale: prefs.lastLangCode ?? "hi",
      onPartial: (text) => {
        if (phaseRef.current !== "idle") return;
        if (containsWakePhrase(text)) {
          void tryWakeActivation();
        }
      },
      onFinal: (text) => {
        if (phaseRef.current !== "idle") return;
        if (containsWakePhrase(text)) {
          void tryWakeActivation();
        }
      },
      onError: () => {
        listeningRef.current = false;
      },
    });

    setTimeout(() => {
      if (listeningRef.current && phaseRef.current === "idle") {
        listeningRef.current = false;
        void stopListening();
      }
    }, 10000);
  }, [prefs?.enabled, prefs?.voiceEnrolled, prefs?.lastLangCode, tryWakeActivation]);

  useEffect(() => {
    if (!isAuthenticated || !prefs?.enabled || !prefs.voiceEnrolled) {
      void stopListening();
      listeningRef.current = false;
      return;
    }
    if (Platform.OS === "web") return;

    const restart = () => {
      if (AppState.currentState === "active") {
        void startWakeListening();
      }
    };

    restart();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") restart();
      else void stopListening();
    });
    const timer = setInterval(restart, 12000);

    return () => {
      clearInterval(timer);
      appSub.remove();
      void stopListening();
      void destroySpeech();
      listeningRef.current = false;
    };
  }, [isAuthenticated, prefs?.enabled, prefs?.voiceEnrolled, startWakeListening]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!user?.sessionToken) return;
    await patchAssistantPrefs(user.sessionToken, { enabled });
    await refreshPrefs();
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
