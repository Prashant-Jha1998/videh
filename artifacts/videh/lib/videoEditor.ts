export type VideoFilterId = "none" | "vivid" | "warm" | "cool" | "bw" | "sepia";

export type VideoTextOverlay = {
  id: string;
  text: string;
  /** 0–1 relative X on preview frame */
  x: number;
  /** 0–1 relative Y on preview frame */
  y: number;
  color: string;
  fontSize: number;
};

export type VideoEditorMetadata = {
  filter: VideoFilterId;
  caption: string;
  textOverlays: VideoTextOverlay[];
};

export type SelectedSound = {
  id: number;
  title: string;
  artist: string;
  audioUrl: string;
  duration: number;
};

export const VIDEO_FILTER_OPTIONS: Array<{ id: VideoFilterId; label: string }> = [
  { id: "none", label: "Original" },
  { id: "vivid", label: "Vivid" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "bw", label: "B&W" },
  { id: "sepia", label: "Sepia" },
];

export function filterOverlayColor(filter: VideoFilterId): string | null {
  switch (filter) {
    case "vivid": return "rgba(255, 80, 180, 0.12)";
    case "warm": return "rgba(255, 170, 60, 0.18)";
    case "cool": return "rgba(60, 140, 255, 0.18)";
    case "bw": return "rgba(128, 128, 128, 0.35)";
    case "sepia": return "rgba(112, 66, 20, 0.28)";
    default: return null;
  }
}

export function defaultEditorMetadata(): VideoEditorMetadata {
  return { filter: "none", caption: "", textOverlays: [] };
}

export function newTextOverlay(text = "Tap to edit"): VideoTextOverlay {
  return {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    x: 0.12,
    y: 0.38,
    color: "#FFFFFF",
    fontSize: 22,
  };
}
