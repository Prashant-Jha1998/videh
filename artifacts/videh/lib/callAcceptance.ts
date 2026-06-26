/** Merge accepted participant ids from API list + invite statuses map. */
export function mergeAcceptedUserIds(
  acceptedUserIds?: number[],
  statuses?: Record<string, string>,
): number[] {
  const ids = new Set<number>();
  for (const id of acceptedUserIds ?? []) {
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  if (statuses) {
    for (const [id, status] of Object.entries(statuses)) {
      if (status === "accepted") {
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) ids.add(n);
      }
    }
  }
  return [...ids];
}

/** Outgoing side: true when someone other than me has accepted the invite. */
export function isOutgoingPeerAccepted(
  userId: number,
  acceptedUserIds: number[],
  statuses?: Record<string, string>,
): boolean {
  const merged = mergeAcceptedUserIds(acceptedUserIds, statuses);
  return merged.some((id) => id !== userId);
}
