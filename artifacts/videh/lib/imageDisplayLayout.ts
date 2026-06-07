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

/** Largest aspect-ratio rect centered inside display bounds (e.g. 16:9 thumbnail frame). */
export function aspectCropInBounds(bounds: DisplayBounds, aspect: number): { x: number; y: number; w: number; h: number } {
  if (aspect <= 0) return { x: 0, y: 0, w: bounds.w, h: bounds.h };
  let w = bounds.w;
  let h = w / aspect;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * aspect;
  }
  return { x: (bounds.w - w) / 2, y: (bounds.h - h) / 2, w, h };
}
