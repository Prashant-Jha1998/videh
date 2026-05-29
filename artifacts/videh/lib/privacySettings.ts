import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

export const VISIBILITY_OPTIONS = ["Everyone", "My contacts", "Nobody"] as const;
export type VisibilityLabel = (typeof VISIBILITY_OPTIONS)[number];

export const DISAPPEAR_OPTIONS = [
  { label: "Off", seconds: null as number | null },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "90 days", seconds: 7776000 },
] as const;

export type PrivacySettings = {
  lastSeenLabel: string;
  onlineLabel: string;
  profilePhotoLabel: VisibilityLabel;
  aboutLabel: VisibilityLabel;
  statusLabel: VisibilityLabel;
  groupsLabel: VisibilityLabel;
  readReceiptsEnabled: boolean;
  disappearLabel: string;
  defaultDisappearSeconds: number | null;
  silenceUnknownCallers: boolean;
};

function labelToPrivacy(label: string): "everyone" | "contacts" | "nobody" {
  if (label === "Everyone") return "everyone";
  if (label === "Nobody") return "nobody";
  return "contacts";
}

export async function fetchPrivacySettings(
  userId: number,
  sessionToken?: string | null,
): Promise<PrivacySettings | null> {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/privacy`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
  });
  const data = await res.json();
  if (!data.success) return null;
  return {
    lastSeenLabel: data.lastSeenLabel ?? "My contacts",
    onlineLabel: data.onlineLabel ?? "Same as last seen",
    profilePhotoLabel: data.profilePhotoLabel ?? "My contacts",
    aboutLabel: data.aboutLabel ?? "My contacts",
    statusLabel: data.statusLabel ?? "My contacts",
    groupsLabel: data.groupsLabel ?? "Everyone",
    readReceiptsEnabled: data.readReceiptsEnabled !== false,
    disappearLabel: data.disappearLabel ?? "Off",
    defaultDisappearSeconds: data.defaultDisappearSeconds ?? null,
    silenceUnknownCallers: Boolean(data.silenceUnknownCallers),
  };
}

export async function patchPrivacySettings(
  userId: number,
  sessionToken: string | null | undefined,
  patch: Partial<{
    profilePhotoPrivacy: string;
    aboutPrivacy: string;
    statusPrivacy: string;
    groupsPrivacy: string;
    readReceiptsEnabled: boolean;
    defaultDisappearSeconds: number | null;
    silenceUnknownCallers: boolean;
  }>,
): Promise<PrivacySettings | null> {
  const res = await fetch(`${BASE_URL}/api/users/${userId}/privacy`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!data.success) return null;
  return {
    lastSeenLabel: data.lastSeenLabel ?? "My contacts",
    onlineLabel: data.onlineLabel ?? "Same as last seen",
    profilePhotoLabel: data.profilePhotoLabel ?? "My contacts",
    aboutLabel: data.aboutLabel ?? "My contacts",
    statusLabel: data.statusLabel ?? "My contacts",
    groupsLabel: data.groupsLabel ?? "Everyone",
    readReceiptsEnabled: data.readReceiptsEnabled !== false,
    disappearLabel: data.disappearLabel ?? "Off",
    defaultDisappearSeconds: data.defaultDisappearSeconds ?? null,
    silenceUnknownCallers: Boolean(data.silenceUnknownCallers),
  };
}

export function visibilityLabelToApi(label: VisibilityLabel): "everyone" | "contacts" | "nobody" {
  return labelToPrivacy(label);
}

/** Cached locally so call handling works before the next privacy fetch. */
export const PRIVACY_CACHE_KEYS = {
  readReceipts: "privacyReadReceiptsEnabled",
  silenceUnknown: "privacySilenceUnknownCallers",
} as const;

export async function cachePrivacyFlags(settings: PrivacySettings): Promise<void> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  await Promise.all([
    AsyncStorage.setItem(PRIVACY_CACHE_KEYS.readReceipts, settings.readReceiptsEnabled ? "true" : "false"),
    AsyncStorage.setItem(PRIVACY_CACHE_KEYS.silenceUnknown, settings.silenceUnknownCallers ? "true" : "false"),
  ]);
}

export async function loadCachedReadReceiptsEnabled(): Promise<boolean> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const v = await AsyncStorage.getItem(PRIVACY_CACHE_KEYS.readReceipts);
  return v !== "false";
}

export async function loadCachedSilenceUnknownCallers(): Promise<boolean> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  return (await AsyncStorage.getItem(PRIVACY_CACHE_KEYS.silenceUnknown)) === "true";
}
