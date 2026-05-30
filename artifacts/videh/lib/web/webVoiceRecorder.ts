import { meteringToLevel } from "../voiceWaveform";
import { registerWebFile } from "./webFileRegistry";

export type WebVoiceRecording = {
  uri: string;
  durationSec: number;
  waveform: number[];
};

export class WebVoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private metering: number[] = [];
  private startedAt = 0;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;

  async start(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone is not available in this browser.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.chunks = [];
    this.metering = [];
    this.startedAt = Date.now();

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.chunks.push(ev.data);
    };

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.meterTimer = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i]!;
        const avg = sum / data.length;
        const level = meteringToLevel(-60 + (avg / 255) * 60);
        this.metering.push(level);
      }, 80);
    } catch {
      /* metering optional */
    }

    this.mediaRecorder.start(100);
  }

  async stop(cancelled: boolean): Promise<WebVoiceRecording | null> {
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === "inactive") {
      this.cleanup();
      return null;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        resolve(this.chunks.length ? new Blob(this.chunks, { type }) : null);
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });

    this.cleanup();

    if (cancelled || !blob || blob.size < 200) return null;

    const durationSec = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const ext = blob.type.includes("webm") ? "webm" : "m4a";
    const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
    const uri = registerWebFile(file);
    const waveform = this.metering.length > 0 ? this.metering : Array.from({ length: 12 }, () => 0.35);
    return { uri, durationSec, waveform };
  }

  private cleanup(): void {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.analyser = null;
  }
}
