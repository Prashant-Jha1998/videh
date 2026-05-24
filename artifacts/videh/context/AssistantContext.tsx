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
  verifyAssistantVoice,
} from "@/lib/assistantApi";
import {
  containsWakePhrase,
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
import { recordVoiceSample } from "@/lib/voiceEnrollment";
import { localActivationGreeting } from "@/lib/assistantGreeting";

type AssistantPhase = "idle" | "listening" | "wake" | "active" | "processing" | "speaking";

type AssistantContextType = {
  prefs: AssistantPrefs | null;
  phase: AssistantPhase;
  transcript: string;
  lastResponse: string;
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
  const listeningRef = useRef(false);
  const phaseRef = useRef<AssistantPhase>("idle");
  const commandBufferRef = useRef("");

  const setPhaseSafe = useCallback((p: AssistantPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const refreshPrefs = useCallback(async () => {
    if (!user?.sessionToken) return;
    const p = await fetchAssistantPrefs(user.sessionToken);
    if (p) {
      setPrefs(p);
      await setLocalAssistantPrefs(p);
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
    setPhaseSafe("processing");
    try {
      const result = await runAssistantCommand(user.sessionToken, cleaned, "hi");
      setLastResponse(result.speak);
      setPhaseSafe("speaking");
      await speakAssistant(result.speak, "hi");
      const openChat = result.actions?.find((a) => a.type === "open_chat" && a.chatId);
      if (openChat?.chatId) {
        router.push({ pathname: "/chat/[id]", params: { id: openChat.chatId } });
      }
    } catch {
      setLastResponse("Maaf kijiye, abhi ye command process nahi ho payi.");
      await speakAssistant("Maaf kijiye, abhi ye command process nahi ho payi.", "hi");
    } finally {
      dismiss();
    }
  }, [user?.sessionToken, setPhaseSafe, dismiss, router]);

  const activateAssistant = useCallback(async () => {
    if (!user?.sessionToken || !user.dbId) return;
    setPhaseSafe("active");
    const displayName = prefs?.userName || user.name || "User";
    let greeting = localActivationGreeting(displayName, "hi");
    try {
      greeting = await fetchAssistantGreeting(user.sessionToken, user.dbId, "hi");
    } catch {
      /* use local greeting with app user name */
    }
    setLastResponse(greeting);
    setPhaseSafe("speaking");
    await speakAssistant(greeting, "hi");
    setPhaseSafe("listening");
    setTranscript("");
    commandBufferRef.current = "";
    await startListening({
      locale: "hi",
      onPartial: (t) => setTranscript(t),
      onFinal: (t) => {
        commandBufferRef.current = t;
      },
      onError: () => {},
    });
    setTimeout(() => {
      void stopListening();
      const cmd = commandBufferRef.current.trim() || transcript.trim();
      if (cmd) void handleCommand(cmd);
      else dismiss();
    }, 12000);
  }, [user?.sessionToken, user?.dbId, user?.name, prefs?.userName, setPhaseSafe, handleCommand, dismiss, transcript]);

  const tryWakeActivation = useCallback(async () => {
    if (!user?.sessionToken || phaseRef.current !== "idle") return;
    setPhaseSafe("wake");
    try {
      const fp = await recordVoiceSample(1800);
      const { match } = await verifyAssistantVoice(user.sessionToken, fp);
      if (!match) {
        setPhaseSafe("idle");
        return;
      }
      await activateAssistant();
    } catch {
      setPhaseSafe("idle");
    }
  }, [user?.sessionToken, setPhaseSafe, activateAssistant]);

  const startWakeListening = useCallback(async () => {
    if (!prefs?.enabled || !prefs.voiceEnrolled || !isSpeechRecognitionAvailable()) return;
    if (listeningRef.current || phaseRef.current !== "idle") return;
    listeningRef.current = true;
    await startListening({
      locale: "hi",
      onPartial: (text) => {
        if (phaseRef.current !== "idle") return;
        if (containsWakePhrase(text)) {
          listeningRef.current = false;
          void stopListening();
          void tryWakeActivation();
        }
      },
      onError: () => {
        listeningRef.current = false;
      },
    });
  }, [prefs?.enabled, prefs?.voiceEnrolled, tryWakeActivation]);

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
