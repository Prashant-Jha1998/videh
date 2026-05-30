/**
 * Generates short WAV tones for Videh Premium Sounds (run once: node scripts/generate-premium-sounds.mjs).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "assets", "sounds");

function writeWav(filePath, samples, sampleRate = 22050) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(clamped * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

function tone(freq, durationSec, sampleRate, { vol = 0.35, fade = true } = {}) {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = fade ? Math.min(1, i / (sampleRate * 0.02), (n - i) / (sampleRate * 0.08)) : 1;
    out[i] = Math.sin(2 * Math.PI * freq * t) * vol * env;
  }
  return out;
}

function chord(freqs, durationSec, sampleRate, vol = 0.28) {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / (sampleRate * 0.02), (n - i) / (sampleRate * 0.1));
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * t);
    out[i] = (s / freqs.length) * vol * env;
  }
  return out;
}

function concat(...parts) {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function ringPattern(baseFreq, loops = 4) {
  const parts = [];
  for (let i = 0; i < loops; i++) {
    parts.push(tone(baseFreq, 0.35, 22050, { vol: 0.4 }));
    parts.push(new Float32Array(Math.floor(22050 * 0.25)));
  }
  return concat(...parts);
}

const defs = {
  msg_default: () => tone(880, 0.22, 22050),
  msg_chime: () => concat(tone(1046, 0.12, 22050), tone(1318, 0.18, 22050, { vol: 0.3 })),
  msg_soft: () => tone(660, 0.35, 22050, { vol: 0.25 }),
  msg_alert: () => concat(tone(1200, 0.08, 22050, { vol: 0.45 }), tone(900, 0.12, 22050, { vol: 0.35 })),
  msg_vip: () => chord([523, 659, 784], 0.45, 22050, 0.32),
  msg_romantic: () => chord([392, 494, 587], 0.5, 22050, 0.3),
  msg_business: () => tone(520, 0.15, 22050, { vol: 0.32 }),
  msg_family: () => chord([440, 554, 659], 0.4, 22050, 0.28),
  msg_office: () => concat(tone(700, 0.1, 22050), tone(550, 0.14, 22050)),
  msg_nature: () => tone(740, 0.28, 22050, { vol: 0.22 }),
  msg_festival: () => concat(tone(988, 0.1, 22050), tone(1175, 0.1, 22050), tone(1318, 0.15, 22050)),
  msg_gaming: () => concat(tone(1568, 0.06, 22050, { vol: 0.4 }), tone(1976, 0.08, 22050, { vol: 0.35 })),
  call_default: () => ringPattern(440, 5),
  call_modern: () => ringPattern(523, 5),
  call_soft: () => ringPattern(330, 4),
  call_business: () => ringPattern(392, 5),
  call_nature: () => ringPattern(494, 4),
  call_musical: () => concat(
    chord([262, 330, 392], 0.6, 22050, 0.25),
    new Float32Array(Math.floor(22050 * 0.4)),
    chord([294, 370, 440], 0.6, 22050, 0.25),
  ),
  call_classic: () => ringPattern(480, 6),
  ringback: () => ringPattern(425, 3),
  call_busy: () => concat(tone(480, 0.15, 22050), new Float32Array(22050 * 0.2), tone(480, 0.15, 22050)),
  call_unavailable: () => tone(300, 0.5, 22050, { vol: 0.35 }),
  incoming_call: () => ringPattern(440, 5),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, fn] of Object.entries(defs)) {
  const samples = fn();
  writeWav(path.join(OUT, `${name}.wav`), samples);
  console.log("wrote", `${name}.wav`);
}
console.log("Done:", OUT);
