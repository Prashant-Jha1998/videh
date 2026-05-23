import NetInfo from "@react-native-community/netinfo";

/** Photos: mobile data + Wi‑Fi. Videos/docs Wi‑Fi-only toggles use this check. */
export async function isUnmeteredNetwork(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return false;
    if (state.type === "wifi" || state.type === "ethernet") return true;
    // Android may expose unmetered cellular
    const details = state.details as { isConnectionExpensive?: boolean } | null;
    if (typeof details?.isConnectionExpensive === "boolean") {
      return !details.isConnectionExpensive;
    }
    return false;
  } catch {
    return true;
  }
}

export async function shouldAutoDownload(kind: "image" | "video" | "document", settings: {
  autoDownloadImages: boolean;
  autoDownloadVideos: boolean;
  autoDownloadDocs: boolean;
}): Promise<boolean> {
  if (kind === "image") return settings.autoDownloadImages;
  if (kind === "video") return settings.autoDownloadVideos && (await isUnmeteredNetwork());
  return settings.autoDownloadDocs && (await isUnmeteredNetwork());
}
