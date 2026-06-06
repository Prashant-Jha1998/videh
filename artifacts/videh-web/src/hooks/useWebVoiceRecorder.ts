import { useCallback, useRef, useState } from "react";

function pickMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
}

function levelFromAnalyser(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / (data.length * 255);
  return Math.max(0.08, Math.min(1, avg * 2.2));
}

export function useWebVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [liveWave, setLiveWave] = useState<number[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const waveformRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    chunksRef.current = [];
    waveformRef.current = [];
    setRecording(false);
    setDurationSec(0);
    setLiveWave([]);
  }, []);

  const start = useCallback(async () => {
    if (recording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone is not supported in this browser.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    waveformRef.current = [];

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(120);
    startedAtRef.current = Date.now();
    setRecording(true);

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setDurationSec(elapsed);
      const level = levelFromAnalyser(analyser);
      waveformRef.current.push(level);
      const tail = waveformRef.current.slice(-32);
      setLiveWave(tail);
    }, 120);
  }, [recording]);

  const stop = useCallback(async (): Promise<{ blob: Blob; durationSec: number; waveform: number[]; mimeType: string } | null> => {
    if (!recording || !recorderRef.current) return null;

    const recorder = recorderRef.current;
    const mimeType = recorder.mimeType || pickMimeType();
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    const waveform = [...waveformRef.current];

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeType });
        if (b.size < 100) {
          reject(new Error("Recording too short."));
          return;
        }
        resolve(b);
      };
      recorder.onerror = () => reject(new Error("Recording failed."));
      recorder.stop();
    });

    cleanup();
    return { blob, durationSec: duration, waveform, mimeType };
  }, [recording, cleanup]);

  const cancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { recording, durationSec, liveWave, start, stop, cancel };
}
