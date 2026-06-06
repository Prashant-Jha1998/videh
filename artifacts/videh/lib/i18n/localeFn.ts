import { en } from "./en";

/** Build a locale pack from English with per-key overrides. */
export function locale(overrides: Record<string, string>): Record<string, string> {
  return { ...en, ...overrides };
}
