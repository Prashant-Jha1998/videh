import type { Status } from "@/context/AppContext";

export type StatusViewerGroup = {
  userId: string;
  statuses: Status[];
  latestTime: number;
  hasUnviewed: boolean;
  isBoosted: boolean;
};

/** Same ordering as the Status tab list (boosted → unviewed → recent). */
export function buildOtherStatusGroups(statuses: Status[]): StatusViewerGroup[] {
  const map: Record<string, Status[]> = {};
  for (const s of statuses) {
    if (s.userId === "me") continue;
    if (!map[s.userId]) map[s.userId] = [];
    map[s.userId].push(s);
  }
  return Object.values(map)
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
      return {
        userId: group[0].userId,
        statuses: sorted,
        latestTime: Math.max(...group.map((s) => s.timestamp)),
        hasUnviewed: group.some((s) => !s.viewed),
        isBoosted: group.some((s) => s.isBoosted),
      };
    })
    .sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return b.latestTime - a.latestTime;
    });
}

/**
 * Story IDs from the tapped user through the rest of the feed (WhatsApp-style).
 * Viewer closes only after the last story in this queue.
 */
export function buildStatusViewerQueueIds(
  statuses: Status[],
  startUserId: string,
): string[] {
  const groups = buildOtherStatusGroups(statuses);
  const startIdx = groups.findIndex((g) => g.userId === startUserId);
  if (startIdx < 0) {
    return statuses
      .filter((s) => s.userId === startUserId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((s) => s.id);
  }
  const ids: string[] = [];
  for (let i = startIdx; i < groups.length; i++) {
    for (const s of groups[i].statuses) ids.push(s.id);
  }
  return ids;
}
