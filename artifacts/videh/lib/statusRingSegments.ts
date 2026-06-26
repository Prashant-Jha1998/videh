import type { Status } from "@/context/AppContext";

export const STATUS_RING_GREEN = "#7C6CF0";
export const STATUS_RING_GREY = "#8696a0";

/** Oldest → newest; true = viewed (grey segment). */
export function getStatusRingSegments(statuses: Status[]): boolean[] {
  return [...statuses]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((s) => s.viewed);
}

export function getContactStatusRingSegments(
  otherUserId: string | number | null | undefined,
  statuses: Status[],
): boolean[] | null {
  if (otherUserId == null) return null;
  const uid = String(otherUserId);
  const theirs = statuses.filter((s) => s.userId === uid);
  if (theirs.length === 0) return null;
  return getStatusRingSegments(theirs);
}
