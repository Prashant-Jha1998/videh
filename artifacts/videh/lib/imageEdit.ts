import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
import { ensureUploadableFileUri } from "./prepareFileUpload";

export type MediaQuality = "standard" | "hd";

export const QUALITY_COMPRESS: Record<MediaQuality, number> = {
  standard: 0.75,
  hd: 1,
};

export type ImageDimensionHints = { width?: number; height?: number };

export function isGifUri(uri: string): boolean {
  return uri.toLowerCase().includes(".gif") || uri.toLowerCase().includes("image/gif");
}

/** Copy content:// / ph:// to stable file:// so crop & rotate work on Android. */
export async function ensureEditableImageUri(uri: string): Promise<string> {
  if (!uri || isGifUri(uri)) return uri;
  return ensureUploadableFileUri(uri, `edit_${Date.now()}.jpg`);
}

export async function getImageDimensions(
  uri: string,
  hints?: ImageDimensionHints,
): Promise<{ width: number; height: number }> {
  if (hints?.width && hints?.height && hints.width > 0 && hints.height > 0) {
    return { width: Math.round(hints.width), height: Math.round(hints.height) };
  }

  const local = await ensureEditableImageUri(uri);

  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(local, (width, height) => resolve({ width, height }), reject);
    });
    if (size.width > 0 && size.height > 0) return size;
  } catch {
    /* fall through */
  }

  const probe = await ImageManipulator.manipulateAsync(local, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  if (probe.width > 0 && probe.height > 0) {
    return { width: probe.width, height: probe.height };
  }

  throw new Error("Could not read image dimensions.");
}

async function manipulate(
  uri: string,
  actions: ImageManipulator.Action[],
  quality: MediaQuality,
): Promise<string> {
  const local = await ensureEditableImageUri(uri);
  const result = await ImageManipulator.manipulateAsync(local, actions, {
    compress: QUALITY_COMPRESS[quality],
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export async function rotateImage(
  uri: string,
  quality: MediaQuality,
  hints?: ImageDimensionHints,
): Promise<string> {
  if (isGifUri(uri)) return uri;
  void hints;
  return manipulate(uri, [{ rotate: 90 }], quality);
}

/** Center square crop (1:1). */
export async function squareCropImage(
  uri: string,
  quality: MediaQuality,
  hints?: ImageDimensionHints,
): Promise<string> {
  if (isGifUri(uri)) return uri;
  return cropImageToAspect(uri, quality, 1, 1, hints);
}

/** Center crop to aspect ratio (e.g. 4:5 portrait, 16:9 landscape). */
export async function cropImageToAspect(
  uri: string,
  quality: MediaQuality,
  aspectW: number,
  aspectH: number,
  hints?: ImageDimensionHints,
): Promise<string> {
  if (isGifUri(uri)) return uri;
  if (aspectW <= 0 || aspectH <= 0) throw new Error("Invalid crop aspect.");

  const local = await ensureEditableImageUri(uri);
  const { width, height } = await getImageDimensions(local, hints);
  const targetAspect = aspectW / aspectH;
  const currentAspect = width / height;

  let cropW: number;
  let cropH: number;
  let originX: number;
  let originY: number;

  if (currentAspect > targetAspect) {
    cropH = height;
    cropW = Math.max(1, Math.floor(height * targetAspect));
    originX = Math.max(0, Math.floor((width - cropW) / 2));
    originY = 0;
  } else {
    cropW = width;
    cropH = Math.max(1, Math.floor(width / targetAspect));
    originX = 0;
    originY = Math.max(0, Math.floor((height - cropH) / 2));
  }

  const result = await ImageManipulator.manipulateAsync(
    local,
    [{ crop: { originX, originY, width: cropW, height: cropH } }],
    { compress: QUALITY_COMPRESS[quality], format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function applyImageQuality(uri: string, quality: MediaQuality): Promise<string> {
  if (isGifUri(uri) || quality === "hd") return uri;
  const local = await ensureEditableImageUri(uri);
  const result = await ImageManipulator.manipulateAsync(local, [], {
    compress: QUALITY_COMPRESS.standard,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export function imageMimeFromUri(uri: string): string {
  if (isGifUri(uri)) return "image/gif";
  if (uri.toLowerCase().includes(".png")) return "image/png";
  return "image/jpeg";
}

export function imageExtFromUri(uri: string): string {
  if (isGifUri(uri)) return "gif";
  if (uri.toLowerCase().includes(".png")) return "png";
  return "jpg";
}
