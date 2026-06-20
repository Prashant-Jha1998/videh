export type PlayStoreAppInfo = {
  packageId: string;
  title: string;
  developer: string;
  iconUrl: string | null;
  rating: number | null;
  reviewCountLabel: string | null;
  installsLabel: string | null;
  category: string | null;
  priceLabel: string;
  source: "play_store";
};

const PLAY_STORE_HOSTS = new Set(["play.google.com", "play.google.co.in"]);

export function parsePlayStorePackageId(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (/^[a-zA-Z][\w.]*(?:\.[\w.]+)+$/.test(raw) && !raw.includes("/")) {
    return raw;
  }
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!PLAY_STORE_HOSTS.has(url.hostname.replace(/^www\./, ""))) return null;
    const id = url.searchParams.get("id");
    return id?.trim() || null;
  } catch {
    const idMatch = raw.match(/[?&]id=([a-zA-Z][\w.]*(?:\.[\w.]+)+)/);
    return idMatch?.[1] ?? null;
  }
}

function formatReviewCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count >= 1_000_000) {
    const m = count / 1_000_000;
    const label = m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
    return `${label} reviews`;
  }
  if (count >= 1_000) {
    return `${Math.round(count / 1_000)}K reviews`;
  }
  return `${count} reviews`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function pickMetaContent(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(`<meta\\s+${attr}=["']${key}["']\\s+content=["']([^"']+)["']`, "i");
  const alt = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+${attr}=["']${key}["']`, "i");
  const m = html.match(re) ?? html.match(alt);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function formatPlayStoreCategory(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/\s+/g, "_");
  const labels: Record<string, string> = {
    TRAVEL_AND_LOCAL: "Travel & Local",
    SOCIAL: "Social",
    COMMUNICATION: "Communication",
    ENTERTAINMENT: "Entertainment",
    TOOLS: "Tools",
    PRODUCTIVITY: "Productivity",
    BUSINESS: "Business",
    FINANCE: "Finance",
    SHOPPING: "Shopping",
    HEALTH_AND_FITNESS: "Health & Fitness",
    EDUCATION: "Education",
    LIFESTYLE: "Lifestyle",
    FOOD_AND_DRINK: "Food & Drink",
    PHOTOGRAPHY: "Photography",
    MUSIC_AND_AUDIO: "Music & Audio",
    VIDEO_PLAYERS: "Video Players",
    NEWS_AND_MAGAZINES: "News & Magazines",
    BOOKS_AND_REFERENCE: "Books & Reference",
    MAPS_AND_NAVIGATION: "Maps & Navigation",
    WEATHER: "Weather",
    GAME: "Game",
    GAME_ACTION: "Action",
    GAME_ADVENTURE: "Adventure",
    GAME_ARCADE: "Arcade",
    GAME_BOARD: "Board",
    GAME_CARD: "Card",
    GAME_CASINO: "Casino",
    GAME_CASUAL: "Casual",
    GAME_EDUCATIONAL: "Educational",
    GAME_MUSIC: "Music",
    GAME_PUZZLE: "Puzzle",
    GAME_RACING: "Racing",
    GAME_ROLE_PLAYING: "Role Playing",
    GAME_SIMULATION: "Simulation",
    GAME_SPORTS: "Sports",
    GAME_STRATEGY: "Strategy",
    GAME_TRIVIA: "Trivia",
    GAME_WORD: "Word",
  };
  if (labels[key]) return labels[key];
  return raw
    .replace(/_/g, " ")
    .replace(/\s+AND\s+/gi, " & ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseJsonLdApps(html: string): Record<string, unknown>[] {
  const apps: Record<string, unknown>[] = [];
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && typeof item === "object") {
          const type = String((item as Record<string, unknown>)["@type"] ?? "");
          if (type.includes("SoftwareApplication") || type.includes("MobileApplication")) {
            apps.push(item as Record<string, unknown>);
          }
        }
      }
    } catch {
      /* ignore malformed blocks */
    }
  }
  return apps;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseRating(aggregateRating: unknown): { rating: number | null; reviewCountLabel: string | null } {
  if (!aggregateRating || typeof aggregateRating !== "object") {
    return { rating: null, reviewCountLabel: null };
  }
  const row = aggregateRating as Record<string, unknown>;
  const ratingRaw = row.ratingValue ?? row.rating;
  const rating = ratingRaw != null ? Number(ratingRaw) : null;
  const countRaw = row.ratingCount ?? row.reviewCount;
  const count = countRaw != null ? Number(countRaw) : null;
  return {
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    reviewCountLabel: count != null && Number.isFinite(count) ? formatReviewCount(count) : null,
  };
}

function parseInstallsFromHtml(html: string): string | null {
  const patterns = [
    /<div class="ClM7O">([^<]+)<\/div>\s*<div class="g1rdde">Downloads<\/div>/i,
    />([\d,.]+[KMB]?\+?)<\/div>\s*<div[^>]*>\s*Downloads\s*<\/div>/i,
    /([\d,.]+[KMB]?\+?)\s+downloads/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function parseCategory(app: Record<string, unknown>): string | null {
  const cat = app.applicationCategory ?? app.genre;
  if (typeof cat === "string" && cat.trim()) return formatPlayStoreCategory(cat);
  if (Array.isArray(cat) && typeof cat[0] === "string") return formatPlayStoreCategory(cat[0]);
  return null;
}

function parsePriceLabel(app: Record<string, unknown>): string {
  const offers = app.offers;
  if (offers && typeof offers === "object") {
    const price = (offers as Record<string, unknown>).price;
    if (price === 0 || price === "0" || price === "0.00") return "FREE";
    if (typeof price === "string" && price.trim()) return price.trim();
  }
  return "FREE";
}

async function fetchPlayStoreHtml(packageId: string): Promise<string> {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en&gl=IN`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "en-IN,en;q=0.9",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Play Store returned ${res.status}`);
  }
  return res.text();
}

export async function lookupPlayStoreApp(urlOrPackageId: string): Promise<PlayStoreAppInfo | null> {
  const packageId = parsePlayStorePackageId(urlOrPackageId);
  if (!packageId) return null;

  const html = await fetchPlayStoreHtml(packageId);
  const jsonLdApps = parseJsonLdApps(html);
  const app = jsonLdApps[0];

  const ogTitle = pickMetaContent(html, "property", "og:title");
  const ogImage = pickMetaContent(html, "property", "og:image");

  const title = (app ? pickString(app, "name") : null)
    ?? (ogTitle ? ogTitle.replace(/\s*[-–—]\s*Apps on Google Play\s*$/i, "").trim() : null);
  const developerRow = app?.author;
  const developer = developerRow && typeof developerRow === "object"
    ? pickString(developerRow as Record<string, unknown>, "name")
    : typeof developerRow === "string"
      ? developerRow
      : null;
  const iconUrl = (app ? pickString(app, "image") : null) ?? ogImage;
  const parsedRating = app ? parseRating(app.aggregateRating) : { rating: null, reviewCountLabel: null };
  const rating = parsedRating.rating != null ? Math.round(parsedRating.rating * 10) / 10 : null;
  const reviewCountLabel = parsedRating.reviewCountLabel;
  const category = app ? parseCategory(app) : null;
  const priceLabel = app ? parsePriceLabel(app) : "FREE";
  const installsLabel = parseInstallsFromHtml(html);

  if (!title && !developer && !rating && !installsLabel) {
    return null;
  }

  return {
    packageId,
    title: title ?? packageId,
    developer: developer ?? "",
    iconUrl,
    rating,
    reviewCountLabel,
    installsLabel,
    category,
    priceLabel,
    source: "play_store",
  };
}

/** Fill missing creative app fields from Play Store when URL is present. */
export async function enrichAppInstallFieldsFromPlayStore(opts: {
  playStoreUrl?: string | null;
  appName?: string | null;
  appDeveloper?: string | null;
  imageUrl?: string | null;
  appRating?: number | null;
  appReviewCount?: string | null;
  appDownloadCount?: string | null;
  appCategory?: string | null;
  appPriceLabel?: string | null;
}): Promise<{
  appName: string | null;
  appDeveloper: string | null;
  imageUrl: string | null;
  appRating: number | null;
  appReviewCount: string | null;
  appDownloadCount: string | null;
  appCategory: string | null;
  appPriceLabel: string;
  playStoreFilled: boolean;
}> {
  const base = {
    appName: opts.appName?.trim() || null,
    appDeveloper: opts.appDeveloper?.trim() || null,
    imageUrl: opts.imageUrl?.trim() || null,
    appRating: opts.appRating ?? null,
    appReviewCount: opts.appReviewCount?.trim() || null,
    appDownloadCount: opts.appDownloadCount?.trim() || null,
    appCategory: opts.appCategory?.trim() || null,
    appPriceLabel: opts.appPriceLabel?.trim() || "FREE",
    playStoreFilled: false,
  };

  if (!opts.playStoreUrl?.trim()) return base;

  try {
    const info = await lookupPlayStoreApp(opts.playStoreUrl);
    if (!info) return base;

    return {
      appName: base.appName ?? info.title,
      appDeveloper: base.appDeveloper ?? (info.developer || null),
      imageUrl: base.imageUrl ?? info.iconUrl,
      appRating: base.appRating ?? info.rating,
      appReviewCount: base.appReviewCount ?? info.reviewCountLabel,
      appDownloadCount: base.appDownloadCount ?? info.installsLabel,
      appCategory: base.appCategory ?? info.category,
      appPriceLabel: base.appPriceLabel === "FREE" && info.priceLabel ? info.priceLabel : base.appPriceLabel,
      playStoreFilled: true,
    };
  } catch {
    return base;
  }
}
