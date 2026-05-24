export function isSpeechRecognitionAvailable(): boolean {
  return false;
}

export async function speakAssistant(text: string): Promise<void> {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    window.speechSynthesis.speak(u);
  }
}

export async function stopSpeaking(): Promise<void> {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export async function startListening(_opts: {
  locale?: "hi" | "en";
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}): Promise<void> {
  _opts.onError?.("Hey Videh voice assistant requires the mobile app.");
}

export async function stopListening(): Promise<void> {}

export async function destroySpeech(): Promise<void> {}
