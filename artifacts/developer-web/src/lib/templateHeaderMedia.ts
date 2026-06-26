import type { HeaderFormat } from "./videhTemplate";

/** Videh template header media (1.91:1). */
export const TEMPLATE_HEADER_IMAGE_WIDTH = 800;
export const TEMPLATE_HEADER_IMAGE_HEIGHT = 418;
export const TEMPLATE_HEADER_VIDEO_WIDTH = 800;
export const TEMPLATE_HEADER_VIDEO_HEIGHT = 418;

export const TEMPLATE_HEADER_MEDIA_LABEL = "800×418 px";

export type HeaderMediaValidation =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "valid"; width: number; height: number }
  | { state: "invalid"; width: number; height: number; message: string }
  | { state: "error"; message: string };

export function headerMediaSpecs(format: Extract<HeaderFormat, "IMAGE" | "VIDEO">): {
  width: number;
  height: number;
  label: string;
} {
  if (format === "VIDEO") {
    return {
      width: TEMPLATE_HEADER_VIDEO_WIDTH,
      height: TEMPLATE_HEADER_VIDEO_HEIGHT,
      label: TEMPLATE_HEADER_MEDIA_LABEL,
    };
  }
  return {
    width: TEMPLATE_HEADER_IMAGE_WIDTH,
    height: TEMPLATE_HEADER_IMAGE_HEIGHT,
    label: TEMPLATE_HEADER_MEDIA_LABEL,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function dimensionMessage(
  actualW: number,
  actualH: number,
  requiredW: number,
  requiredH: number,
  kind: "Image" | "Video",
): string {
  return `${kind} must be exactly ${requiredW}×${requiredH} px. Your file is ${actualW}×${actualH} px.`;
}

function matchesRequiredDimensions(
  width: number,
  height: number,
  requiredW: number,
  requiredH: number,
): boolean {
  return width === requiredW && height === requiredH;
}

export function validateImageDimensions(
  width: number,
  height: number,
): Omit<HeaderMediaValidation, "idle" | "loading" | "error"> {
  const specs = headerMediaSpecs("IMAGE");
  if (matchesRequiredDimensions(width, height, specs.width, specs.height)) {
    return { state: "valid", width, height };
  }
  return {
    state: "invalid",
    width,
    height,
    message: dimensionMessage(width, height, specs.width, specs.height, "Image"),
  };
}

export function validateVideoDimensions(
  width: number,
  height: number,
): Omit<HeaderMediaValidation, "idle" | "loading" | "error"> {
  const specs = headerMediaSpecs("VIDEO");
  if (matchesRequiredDimensions(width, height, specs.width, specs.height)) {
    return { state: "valid", width, height };
  }
  return {
    state: "invalid",
    width,
    height,
    message: dimensionMessage(width, height, specs.width, specs.height, "Video"),
  };
}

export function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not load image. Check the URL is public and uses JPG or PNG."));
    img.src = url;
  });
}

export function loadVideoDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      if (!width || !height) {
        reject(new Error("Could not read video dimensions."));
        return;
      }
      resolve({ width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Could not load video. Check the URL is public and uses MP4."));
    };
    video.src = url;
  });
}

export async function validateHeaderMediaUrl(
  format: Extract<HeaderFormat, "IMAGE" | "VIDEO">,
  url: string,
): Promise<HeaderMediaValidation> {
  const trimmed = url.trim();
  if (!trimmed) return { state: "idle" };
  if (!isHttpUrl(trimmed)) {
    return { state: "error", message: "Enter a valid http(s) URL." };
  }
  try {
    const dims =
      format === "IMAGE" ? await loadImageDimensions(trimmed) : await loadVideoDimensions(trimmed);
    return format === "IMAGE"
      ? validateImageDimensions(dims.width, dims.height)
      : validateVideoDimensions(dims.width, dims.height);
  } catch (e) {
    return {
      state: "error",
      message: e instanceof Error ? e.message : "Could not validate media.",
    };
  }
}

export function headerMediaBlocksSubmit(
  format: HeaderFormat,
  url: string,
  validation: HeaderMediaValidation,
): string | null {
  if (format !== "IMAGE" && format !== "VIDEO") return null;
  if (!url.trim()) {
    return format === "IMAGE" ? "Image URL is required for image header." : "Video URL is required for video header.";
  }
  if (validation.state === "loading") return "Wait for media dimension check to finish.";
  if (validation.state === "error" || validation.state === "invalid") {
    return validation.message;
  }
  if (validation.state !== "valid") return "Media dimensions could not be verified.";
  return null;
}
