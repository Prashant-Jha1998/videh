export type VoiceFingerprint = {
  durationMs: number;
  rmsLevels: number[];
  peakLevel: number;
};

export function normalizeFingerprint(raw: unknown): VoiceFingerprint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const durationMs = Number(o.durationMs);
  const peakLevel = Number(o.peakLevel ?? 0);
  const rmsLevels = Array.isArray(o.rmsLevels)
    ? o.rmsLevels.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : [];
  if (!Number.isFinite(durationMs) || durationMs < 200) return null;
  while (rmsLevels.length < 6) {
    rmsLevels.push(Number.isFinite(peakLevel) && peakLevel > 0 ? peakLevel : 0.2);
  }
  return { durationMs, rmsLevels, peakLevel: Number.isFinite(peakLevel) ? peakLevel : 0 };
}

function vectorFromFingerprint(fp: VoiceFingerprint): number[] {
  const slice = fp.rmsLevels.slice(0, 32);
  while (slice.length < 32) slice.push(0);
  return [...slice, fp.durationMs / 1000, fp.peakLevel];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function compareVoiceFingerprints(
  enrolled: VoiceFingerprint[],
  probe: VoiceFingerprint,
): { match: boolean; score: number } {
  if (enrolled.length === 0) return { match: false, score: 0 };
  const probeVec = vectorFromFingerprint(probe);
  const scores = enrolled.map((fp) => cosineSimilarity(vectorFromFingerprint(fp), probeVec));
  const score = Math.max(...scores);
  const durationDelta = enrolled.map((fp) => Math.abs(fp.durationMs - probe.durationMs));
  const durationOk = Math.min(...durationDelta) < 1200;
  const match = score >= 0.82 && durationOk;
  return { match, score };
}
