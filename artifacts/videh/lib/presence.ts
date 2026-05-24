import { formatTime } from "@/utils/time";

export type PresenceView = {
  canSee: boolean;
  isOnline: boolean;
  lastSeen: string | null;
};

/** Videh-style subtitle for chat header / contact info. */
export function formatPresenceSubtitle(p: PresenceView | null | undefined): string {
  if (!p?.canSee) return "";
  if (p.isOnline) return "online";
  if (!p.lastSeen) return "last seen recently";
  const d = new Date(p.lastSeen);
  if (Number.isNaN(d.getTime())) return "last seen recently";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffHrs = diffMs / 3600000;
  if (diffHrs < 1) {
    const mins = Math.max(1, Math.round(diffMs / 60000));
    return `last seen ${mins} min ago`;
  }
  if (diffHrs < 24) return `last seen today at ${formatTime(d.getTime())}`;
  if (diffHrs < 48) return `last seen yesterday at ${formatTime(d.getTime())}`;
  return `last seen ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

export const LAST_SEEN_PRIVACY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "contacts", label: "My contacts" },
  { value: "contacts_except", label: "My contacts except..." },
  { value: "nobody", label: "Nobody" },
] as const;

export const ONLINE_PRIVACY_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "same_as_last_seen", label: "Same as last seen" },
] as const;
