import { getApiUrl } from "./api";
import { jsonAuthHeaders } from "./authHeaders";

export type PixabaySound = {
  id: number;
  title: string;
  artist: string;
  duration: number;
  audioUrl: string;
  pageUrl: string;
  tags: string;
};

export async function searchVidehSounds(
  query: string,
  sessionToken?: string | null,
  page = 1,
): Promise<{ success: boolean; sounds: PixabaySound[]; total: number; message?: string }> {
  const q = encodeURIComponent(query.trim());
  try {
    const res = await fetch(
      `${getApiUrl()}/api/reels/sounds/search?q=${q}&page=${page}&perPage=20`,
      { headers: jsonAuthHeaders(sessionToken) },
    );
    const json = (await res.json()) as {
      success: boolean;
      sounds?: PixabaySound[];
      total?: number;
      message?: string;
    };
    return {
      success: Boolean(json.success),
      sounds: Array.isArray(json.sounds) ? json.sounds : [],
      total: Number(json.total ?? 0),
      message: json.message,
    };
  } catch {
    return { success: false, sounds: [], total: 0, message: "Could not reach sound library." };
  }
}
