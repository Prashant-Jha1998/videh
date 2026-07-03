import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export function linkDisplayHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] ?? url;
  }
}

export function linkIconName(url: string): ComponentProps<typeof Ionicons>["name"] {
  const lower = url.toLowerCase();
  if (lower.includes("play.google.com") || lower.includes("apps.apple.com")) return "logo-google";
  if (lower.includes("instagram.com")) return "logo-instagram";
  if (lower.includes("facebook.com") || lower.includes("fb.com")) return "logo-facebook";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "logo-twitter";
  if (lower.includes("telegram.") || lower.includes("t.me")) return "paper-plane-outline";
  if (/\byoutu/i.test(lower)) return "play-circle-outline";
  return "globe-outline";
}

export function truncateChannelBio(bio: string, maxLen = 100): { text: string; truncated: boolean } {
  const trimmed = bio.trim();
  if (trimmed.length <= maxLen) return { text: trimmed, truncated: false };
  const cut = trimmed.slice(0, maxLen).trimEnd();
  return { text: cut, truncated: true };
}

export function formatJoinedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatVideoCountLabel(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, "")}K videos`;
  return `${count} video${count === 1 ? "" : "s"}`;
}
