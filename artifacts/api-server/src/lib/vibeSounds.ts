/** Royalty-free sounds — Freesound API (Pixabay has no audio API; only images/videos). */

export type VibeSoundHit = {
  id: number;
  title: string;
  artist: string;
  duration: number;
  audioUrl: string;
  pageUrl: string;
  tags: string;
};

export type VibeSoundSearchResult = {
  success: boolean;
  sounds: VibeSoundHit[];
  total: number;
  source?: "freesound" | "catalog";
  message?: string;
};

const FALLBACK_SOUNDS: VibeSoundHit[] = [
  {
    id: 1,
    title: "Chill Beat",
    artist: "Videh Catalog",
    duration: 185,
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    pageUrl: "https://www.soundhelix.com/",
    tags: "chill beat",
  },
  {
    id: 2,
    title: "Upbeat Loop",
    artist: "Videh Catalog",
    duration: 152,
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    pageUrl: "https://www.soundhelix.com/",
    tags: "upbeat",
  },
  {
    id: 3,
    title: "Acoustic Mood",
    artist: "Videh Catalog",
    duration: 183,
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    pageUrl: "https://www.soundhelix.com/",
    tags: "acoustic",
  },
  {
    id: 4,
    title: "Energy Pop",
    artist: "Videh Catalog",
    duration: 129,
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    pageUrl: "https://www.soundhelix.com/",
    tags: "pop energy",
  },
  {
    id: 5,
    title: "Soft Melody",
    artist: "Videh Catalog",
    duration: 280,
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    pageUrl: "https://www.soundhelix.com/",
    tags: "soft melody",
  },
  {
    id: 6,
    title: "Trap Groove",
    artist: "Videh Catalog",
    duration: 175,
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    pageUrl: "https://www.soundhelix.com/",
    tags: "trap groove",
  },
];

type FreesoundResult = {
  id?: number;
  name?: string;
  username?: string;
  duration?: number;
  tags?: string[];
  previews?: { "preview-hq-mp3"?: string; "preview-lq-mp3"?: string };
  url?: string;
};

async function searchFreesound(
  query: string,
  page: number,
  perPage: number,
  token: string,
): Promise<VibeSoundSearchResult> {
  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", query.trim() || "music");
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(perPage));
  url.searchParams.set("fields", "id,name,username,duration,tags,previews,url");
  url.searchParams.set("filter", "duration:[5 TO 300]");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    return { success: false, sounds: [], total: 0, message: `Freesound error (${res.status})` };
  }
  const data = await res.json() as { count?: number; results?: FreesoundResult[] };
  const sounds: VibeSoundHit[] = (data.results ?? [])
    .map((h) => {
      const audioUrl = h.previews?.["preview-hq-mp3"] ?? h.previews?.["preview-lq-mp3"] ?? "";
      if (!audioUrl) return null;
      return {
        id: Number(h.id ?? 0),
        title: String(h.name ?? "Untitled").trim(),
        artist: String(h.username ?? "Freesound").trim(),
        duration: Math.round(Number(h.duration ?? 0)),
        audioUrl,
        pageUrl: String(h.url ?? "https://freesound.org"),
        tags: Array.isArray(h.tags) ? h.tags.join(", ") : "",
      };
    })
    .filter((s): s is VibeSoundHit => Boolean(s));
  return { success: true, sounds, total: Number(data.count ?? sounds.length), source: "freesound" };
}

function searchFallbackCatalog(query: string): VibeSoundSearchResult {
  const q = query.trim().toLowerCase();
  const sounds = q
    ? FALLBACK_SOUNDS.filter((s) =>
      s.title.toLowerCase().includes(q)
      || s.tags.toLowerCase().includes(q)
      || s.artist.toLowerCase().includes(q),
    )
    : FALLBACK_SOUNDS;
  return {
    success: true,
    sounds,
    total: sounds.length,
    source: "catalog",
    message: sounds.length === 0 ? "No tracks in catalog for this search." : undefined,
  };
}

export async function searchVibeSounds(
  query: string,
  page = 1,
  perPage = 20,
): Promise<VibeSoundSearchResult> {
  const token = process.env.FREESOUND_API_KEY?.trim();
  if (token) {
    try {
      const result = await searchFreesound(query, page, perPage, token);
      if (result.success && result.sounds.length > 0) return result;
      if (!result.success) return searchFallbackCatalog(query);
      return { ...searchFallbackCatalog(query), message: "No Freesound results — showing catalog." };
    } catch {
      return searchFallbackCatalog(query);
    }
  }
  return {
    ...searchFallbackCatalog(query),
    message: "Add FREESOUND_API_KEY for full library. See https://freesound.org/docs/api/",
  };
}
