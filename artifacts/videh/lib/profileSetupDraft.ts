import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

export type ProfileSetupDraft = {
  name: string;
  reelsHandle: string;
  about: string;
};

const DRAFT_KEY = "videh_profile_setup_draft";

export async function loadProfileSetupDraft(userId?: number): Promise<ProfileSetupDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse<ProfileSetupDraft & { userId?: number }>(raw, null as never);
    if (!parsed) return null;
    if (userId != null && parsed.userId != null && parsed.userId !== userId) return null;
    return {
      name: String(parsed.name ?? ""),
      reelsHandle: String(parsed.reelsHandle ?? ""),
      about: String(parsed.about ?? ""),
    };
  } catch {
    return null;
  }
}

export async function saveProfileSetupDraft(draft: ProfileSetupDraft, userId?: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, userId: userId ?? null }),
    );
  } catch {
    /* ignore */
  }
}

export async function clearProfileSetupDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
