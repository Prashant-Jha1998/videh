import { formatFullTime } from "@/utils/time";

export type PresenceView = {
  canSee: boolean;
  isOnline: boolean;
  lastSeen: string | null;
  /** When false, do not invent "last seen recently". */
  canSeeLastSeen?: boolean;
};

/** Videh-style subtitle for chat header / contact info. */
export function formatPresenceSubtitle(p: PresenceView | null | undefined): string {
  if (!p?.canSee) return "";
  if (p.isOnline) return "online";
  if (p.canSeeLastSeen === false) return "";
  if (!p.lastSeen) return "";
  const d = new Date(p.lastSeen);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (diffMs < 3600000) {
    const mins = Math.max(1, Math.round(diffMs / 60000));
    return `last seen ${mins} min ago`;
  }
  if (isToday) return `last seen today at ${formatFullTime(d.getTime())}`;
  if (isYesterday) return `last seen yesterday at ${formatFullTime(d.getTime())}`;
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
