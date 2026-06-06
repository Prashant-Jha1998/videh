export type BubbleOverride = {
  sentLight?: string;
  receivedLight?: string;
  sentDark?: string;
  receivedDark?: string;
};

export type ChatBubblePreset = {
  id: string;
  name: string;
  sent: string;
  received: string;
  sentDark?: string;
  receivedDark?: string;
};

export const CHAT_BUBBLE_PRESETS: ChatBubblePreset[] = [
  { id: "classic", name: "Classic", sent: "#D9FDD3", received: "#FFFFFF", sentDark: "#005C4B", receivedDark: "#1F2C34" },
  { id: "videh", name: "Videh", sent: "#A7F3D0", received: "#FFFFFF", sentDark: "#047857", receivedDark: "#1F2C34" },
  { id: "blue", name: "Blue", sent: "#DBEAFE", received: "#FFFFFF", sentDark: "#1E40AF", receivedDark: "#1F2C34" },
  { id: "teal", name: "Teal", sent: "#CCFBF1", received: "#FFFFFF", sentDark: "#0F766E", receivedDark: "#1F2C34" },
  { id: "mint", name: "Mint", sent: "#D1FAE5", received: "#FFFFFF", sentDark: "#065F46", receivedDark: "#1F2C34" },
  { id: "purple", name: "Purple", sent: "#EDE9FE", received: "#FFFFFF", sentDark: "#5B21B6", receivedDark: "#1F2C34" },
  { id: "indigo", name: "Indigo", sent: "#E0E7FF", received: "#FFFFFF", sentDark: "#3730A3", receivedDark: "#1F2C34" },
  { id: "pink", name: "Pink", sent: "#FCE7F3", received: "#FFFFFF", sentDark: "#9D174D", receivedDark: "#1F2C34" },
  { id: "rose", name: "Rose", sent: "#FFE4E6", received: "#FFFFFF", sentDark: "#BE123C", receivedDark: "#1F2C34" },
  { id: "orange", name: "Orange", sent: "#FFEDD5", received: "#FFFFFF", sentDark: "#C2410C", receivedDark: "#1F2C34" },
  { id: "yellow", name: "Yellow", sent: "#FEF9C3", received: "#FFFFFF", sentDark: "#A16207", receivedDark: "#1F2C34" },
  { id: "red", name: "Red", sent: "#FEE2E2", received: "#FFFFFF", sentDark: "#B91C1C", receivedDark: "#1F2C34" },
  { id: "coral", name: "Coral", sent: "#FFDDD6", received: "#FFFFFF", sentDark: "#EA580C", receivedDark: "#1F2C34" },
  { id: "lavender", name: "Lavender", sent: "#F3E8FF", received: "#FFFFFF", sentDark: "#7E22CE", receivedDark: "#1F2C34" },
  { id: "grey", name: "Grey", sent: "#E5E7EB", received: "#FFFFFF", sentDark: "#374151", receivedDark: "#1F2C34" },
  { id: "slate", name: "Slate", sent: "#E2E8F0", received: "#FFFFFF", sentDark: "#334155", receivedDark: "#1F2C34" },
  { id: "dark", name: "Dark sent", sent: "#005C4B", received: "#1F2C34", sentDark: "#005C4B", receivedDark: "#1F2C34" },
  { id: "amoled", name: "AMOLED", sent: "#004D40", received: "#0D1117", sentDark: "#004D40", receivedDark: "#0D1117" },
];

function normColor(c: string | undefined): string {
  return (c ?? "").trim().toUpperCase();
}

export function bubbleOverrideFromPreset(p: ChatBubblePreset): BubbleOverride {
  return {
    sentLight: p.sent,
    receivedLight: p.received,
    sentDark: p.sentDark ?? p.sent,
    receivedDark: p.receivedDark ?? p.received,
  };
}

export function isBubblePresetSelected(
  override: BubbleOverride | null | undefined,
  preset: ChatBubblePreset,
): boolean {
  if (!override) return false;
  const target = bubbleOverrideFromPreset(preset);
  const lightMatch =
    normColor(override.sentLight) === normColor(target.sentLight)
    && normColor(override.receivedLight) === normColor(target.receivedLight);
  if (!lightMatch) return false;
  const fullDarkMatch =
    normColor(override.sentDark) === normColor(target.sentDark)
    && normColor(override.receivedDark) === normColor(target.receivedDark);
  if (fullDarkMatch) return true;
  const legacyFlatDark =
    normColor(override.sentDark) === normColor(override.sentLight)
    && normColor(override.receivedDark) === normColor(override.receivedLight);
  return legacyFlatDark;
}

export function findSelectedBubblePreset(
  override: BubbleOverride | null | undefined,
): ChatBubblePreset | null {
  if (!override) return null;
  return CHAT_BUBBLE_PRESETS.find((p) => isBubblePresetSelected(override, p)) ?? null;
}

export function selectedBubbleLabel(override: BubbleOverride | null | undefined): string {
  if (!override) return "Theme default";
  return findSelectedBubblePreset(override)?.name ?? "Custom";
}
