import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";

export type MediaQuality = "standard" | "hd";

export const QUALITY_COMPRESS: Record<MediaQuality, number> = {
  standard: 0.75,
  hd: 1,
};

export function isGifUri(uri: string): boolean {
  return uri.toLowerCase().includes(".gif") || uri.toLowerCase().includes("image/gif");
}

export function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export async function rotateImage(uri: string, quality: MediaQuality): Promise<string> {
  if (isGifUri(uri)) return uri;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ rotate: 90 }],
    { compress: QUALITY_COMPRESS[quality], format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/** Center square crop (Videh-style quick crop). */
export async function squareCropImage(uri: string, quality: MediaQuality): Promise<string> {
  if (isGifUri(uri)) return uri;
  const { width, height } = await getImageDimensions(uri);
  const size = Math.min(width, height);
  const originX = Math.floor((width - size) / 2);
  const originY = Math.floor((height - size) / 2);
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: size, height: size } }],
    { compress: QUALITY_COMPRESS[quality], format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function applyImageQuality(uri: string, quality: MediaQuality): Promise<string> {
  if (isGifUri(uri) || quality === "hd") return uri;
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [],
    { compress: QUALITY_COMPRESS.standard, format: ImageManipulator.SaveFormat.JPEG },
  );
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
