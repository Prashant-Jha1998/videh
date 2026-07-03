import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Alert, Platform } from "react-native";
import {
  MAX_CHAT_IMAGES_BATCH,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_VIDEO_BYTES,
  MAX_CHAT_VIDEO_DURATION_MS,
  type PickedChatMedia,
} from "./chatMediaPolicy";

export type GalleryAsset = {
  id: string;
  uri: string;
  kind: "image" | "video";
  width: number;
  height: number;
  durationMs?: number;
};

export type GalleryAlbum = {
  id: string;
  title: string;
  assetCount: number;
};

export type GalleryAssetsPage = {
  assets: GalleryAsset[];
  endCursor?: string;
  hasNextPage: boolean;
  totalCount: number;
};

const PAGE_SIZE = 48;
const RECENTS_ID = "";

const PREFERRED_ALBUM_TITLES = [
  "Recents",
  "Recent",
  "Camera",
  "Videos",
  "Video",
  "Screenshots",
  "Screenshot",
  "Downloads",
  "Download",
  "Videh",
];

function mapAsset(asset: MediaLibrary.Asset): GalleryAsset {
  const kind = asset.mediaType === MediaLibrary.MediaType.video ? "video" : "image";
  return {
    id: asset.id,
    uri: asset.uri,
    kind,
    width: asset.width,
    height: asset.height,
    durationMs: kind === "video" && asset.duration ? Math.round(asset.duration * 1000) : undefined,
  };
}

export async function ensureGalleryPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === "granted";
}

export async function loadGalleryAlbums(): Promise<GalleryAlbum[]> {
  if (Platform.OS === "web") return [];
  if (!(await ensureGalleryPermission())) return [];

  const recentsProbe = await MediaLibrary.getAssetsAsync({
    first: 1,
    mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });

  const albums: GalleryAlbum[] = [
    { id: RECENTS_ID, title: "Recents", assetCount: recentsProbe.totalCount },
  ];

  const raw = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  const seen = new Set<string>();
  const sorted = [...raw].sort((a, b) => {
    const ai = PREFERRED_ALBUM_TITLES.findIndex((t) => a.title.toLowerCase().includes(t.toLowerCase()));
    const bi = PREFERRED_ALBUM_TITLES.findIndex((t) => b.title.toLowerCase().includes(t.toLowerCase()));
    const ar = ai < 0 ? 999 : ai;
    const br = bi < 0 ? 999 : bi;
    if (ar !== br) return ar - br;
    return b.assetCount - a.assetCount;
  });

  for (const album of sorted) {
    if (!album.id || album.assetCount <= 0) continue;
    const key = album.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    albums.push({
      id: album.id,
      title: album.title,
      assetCount: album.assetCount,
    });
  }

  return albums;
}

export async function loadGalleryAssetsPage(opts: {
  albumId?: string;
  after?: string;
  limit?: number;
  videosOnly?: boolean;
}): Promise<GalleryAssetsPage> {
  if (Platform.OS === "web") {
    return { assets: [], hasNextPage: false, totalCount: 0 };
  }
  if (!(await ensureGalleryPermission())) {
    return { assets: [], hasNextPage: false, totalCount: 0 };
  }

  const limit = opts.limit ?? PAGE_SIZE;
  const albumId = opts.albumId?.trim() || undefined;
  const videosOnly = opts.videosOnly ?? (albumId ? false : false);

  const query: MediaLibrary.AssetsOptions = {
    first: limit,
    after: opts.after,
    mediaType: videosOnly
      ? [MediaLibrary.MediaType.video]
      : [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  };
  if (albumId) query.album = albumId;

  const page = await MediaLibrary.getAssetsAsync(query);
  return {
    assets: page.assets.map(mapAsset),
    endCursor: page.endCursor,
    hasNextPage: page.hasNextPage,
    totalCount: page.totalCount,
  };
}

export async function resolveGalleryAssetUri(item: GalleryAsset): Promise<string> {
  if (Platform.OS === "web") return item.uri;
  try {
    const info = await MediaLibrary.getAssetInfoAsync({
      id: item.id,
      mediaType: item.kind === "video" ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo,
    });
    return info.localUri ?? item.uri;
  } catch {
    return item.uri;
  }
}

export async function validateGalleryAsset(item: GalleryAsset): Promise<PickedChatMedia | null> {
  const uri = await resolveGalleryAssetUri(item);
  let fileSize = 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && typeof info.size === "number") fileSize = info.size;
  } catch {
    /* ignore */
  }

  if (item.kind === "video") {
    const durationMs = item.durationMs ?? 0;
    if (durationMs > MAX_CHAT_VIDEO_DURATION_MS) {
      Alert.alert("Video too long", "Maximum video length is 3 minutes.");
      return null;
    }
    if (fileSize > MAX_CHAT_VIDEO_BYTES) {
      Alert.alert("Video too large", "Maximum video size is 64 MB. Try a shorter clip.");
      return null;
    }
  } else if (fileSize > MAX_CHAT_IMAGE_BYTES) {
    Alert.alert("Photo too large", "Maximum photo size is 16 MB.");
    return null;
  }

  return {
    uri,
    kind: item.kind,
    durationMs: item.durationMs,
    fileSize: fileSize || undefined,
    width: item.width || undefined,
    height: item.height || undefined,
  };
}

export async function validateGalleryAssets(items: GalleryAsset[]): Promise<PickedChatMedia[]> {
  const out: PickedChatMedia[] = [];
  for (const item of items.slice(0, MAX_CHAT_IMAGES_BATCH)) {
    const picked = await validateGalleryAsset(item);
    if (picked) out.push(picked);
  }
  return out;
}

/** @deprecated use galleryPicker APIs */
export type RecentGalleryAsset = GalleryAsset;
export const loadRecentGalleryAssets = async (limit = 20) => {
  const page = await loadGalleryAssetsPage({ limit });
  return page.assets;
};
export const validateRecentGalleryAsset = validateGalleryAsset;
