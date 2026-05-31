import type { LayoutRectangle } from "react-native";

export type DisplayBounds = { x: number; y: number; w: number; h: number };

/** Letterboxed image rect inside a container (matches `contentFit="contain"`). */
export function computeDisplayBounds(
  container: LayoutRectangle,
  imageW: number,
  imageH: number,
): DisplayBounds {
  const scale = Math.min(container.width / imageW, container.height / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return {
    x: (container.width - w) / 2,
    y: (container.height - h) / 2,
    w,
    h,
  };
}
