import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Bell,
  Brush,
  CircleHelp,
  HardDrive,
  KeyRound,
  Languages,
  Lock,
  Mic,
  Music,
  Palette,
  Radio,
  Share2,
  ShieldAlert,
  Smartphone,
  MessageSquare,
} from "lucide-react";

export type SettingsSectionId =
  | "assistant"
  | "account"
  | "privacy"
  | "theme"
  | "advanced-theme"
  | "chats"
  | "broadcasts"
  | "sos"
  | "notifications"
  | "premium-sounds"
  | "storage"
  | "accessibility"
  | "language"
  | "help"
  | "invite"
  | "updates"
  | "qr-code";

export type SettingsRowDef = {
  id: SettingsSectionId;
  label: string;
  sub: string;
  color: string;
  Icon: LucideIcon;
};

export const SETTINGS_ROWS: SettingsRowDef[] = [
  { id: "assistant", label: "Hey Videh", sub: "Voice assistant", color: "#00A884", Icon: Mic },
  { id: "account", label: "Account", sub: "Security, linked devices", color: "#2196F3", Icon: KeyRound },
  { id: "privacy", label: "Privacy", sub: "Blocked, disappearing messages", color: "#9C27B0", Icon: Lock },
  { id: "theme", label: "App theme", sub: "Colors and gradients", color: "#7C3AED", Icon: Palette },
  { id: "advanced-theme", label: "Advanced theme", sub: "Bubbles, wallpapers, icons", color: "#EC4899", Icon: Brush },
  { id: "chats", label: "Chats", sub: "Theme, wallpaper, backup", color: "#00BCD4", Icon: MessageSquare },
  { id: "broadcasts", label: "Broadcasts", sub: "Send to many contacts", color: "#E91E63", Icon: Radio },
  { id: "sos", label: "SOS", sub: "Emergency contacts", color: "#E74C3C", Icon: ShieldAlert },
  { id: "notifications", label: "Notifications", sub: "Messages and calls", color: "#FF5722", Icon: Bell },
  { id: "premium-sounds", label: "Premium sounds", sub: "Ringtones & tones", color: "#7C4DFF", Icon: Music },
  { id: "storage", label: "Storage and data", sub: "Network usage, downloads", color: "#607D8B", Icon: HardDrive },
  { id: "accessibility", label: "Accessibility", sub: "Font size, contrast", color: "#795548", Icon: Accessibility },
  { id: "language", label: "App language", sub: "Change app language", color: "#009688", Icon: Languages },
  { id: "help", label: "Help", sub: "FAQ and support", color: "#3F51B5", Icon: CircleHelp },
  { id: "invite", label: "Invite a friend", sub: "Share Videh with friends", color: "#8BC34A", Icon: Share2 },
  { id: "updates", label: "App updates", sub: "Version and what's new", color: "#00A884", Icon: Smartphone },
];

export const VISIBILITY_OPTIONS = ["Everyone", "My contacts", "Nobody"] as const;
export type VisibilityLabel = (typeof VISIBILITY_OPTIONS)[number];

export const DISAPPEAR_OPTIONS = [
  { label: "Off", seconds: null as number | null },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "90 days", seconds: 7776000 },
] as const;

export type WebPrivacySettings = {
  lastSeenLabel: string;
  onlineLabel: string;
  profilePhotoLabel: VisibilityLabel;
  aboutLabel: VisibilityLabel;
  statusLabel: VisibilityLabel;
  groupsLabel: VisibilityLabel;
  readReceiptsEnabled: boolean;
  disappearLabel: string;
  defaultDisappearSeconds: number | null;
  silenceUnknownCallers: boolean;
};

export function visibilityLabelToApi(label: VisibilityLabel): string {
  if (label === "Everyone") return "everyone";
  if (label === "Nobody") return "nobody";
  return "contacts";
}
