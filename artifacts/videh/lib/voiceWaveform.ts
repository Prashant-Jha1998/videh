export const VOICE_WAVE_BAR_COUNT = 26;

const WAVE_PREFIX = "|w:";

export function encodeVoiceMessageText(durationSec: number, waveform?: number[]): string {
  const base = `🎤 Voice message (${Math.round(durationSec)}s)`;
  if (!waveform?.length) return base;
  const bars = downsampleWaveform(waveform, VOICE_WAVE_BAR_COUNT);
  const compact = bars.map((n) => n.toFixed(2)).join(",");
  return `${base}${WAVE_PREFIX}${compact}`;
}

export function parseVoiceDurationSec(text: string): number {
  const clean = stripWaveformMeta(text);
  const m = clean.match(/Voice message\s*\((\d+)s\)/i) ?? clean.match(/\((\d+)\s*s\)/i);
  return m ? Number(m[1]) : 0;
}

export function stripWaveformMeta(text: string): string {
  const idx = text.indexOf(WAVE_PREFIX);
  return idx >= 0 ? text.slice(0, idx).trim() : text;
}

export function parseVoiceWaveform(text: string, count = VOICE_WAVE_BAR_COUNT): number[] | null {
  const idx = text.indexOf(WAVE_PREFIX);
  if (idx < 0) return null;
  const raw = text.slice(idx + WAVE_PREFIX.length).trim();
  const nums = raw.split(",").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 0);
  if (nums.length < 4) return null;
  return downsampleWaveform(nums, count);
}

export function meteringToLevel(metering: number): number {
  return Math.max(0.08, Math.min(1, (metering + 55) / 60));
}

export function downsampleWaveform(samples: number[], count: number): number[] {
  if (samples.length === 0) return Array.from({ length: count }, () => 0.25);
  if (samples.length <= count) {
    const out = [...samples];
    while (out.length < count) out.push(samples[samples.length - 1] ?? 0.25);
    return out.map((n) => Math.max(0.08, Math.min(1, n)));
  }
  const out: number[] = [];
  const step = samples.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++) peak = Math.max(peak, samples[j] ?? 0);
    out.push(Math.max(0.08, Math.min(1, peak)));
  }
  return out;
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function fallbackVoiceWaveHeights(seed: string, count: number): number[] {
  let h = hashSeed(seed || "0");
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h << 13), 1274126177) >>> 0;
    out.push(0.28 + ((h % 1000) / 1000) * 0.72);
  }
  return out;
}
