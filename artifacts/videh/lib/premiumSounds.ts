/** Videh Premium Sounds — packs, ringtones, notification tones, contact presets. */

export type SoundPackId = "modern" | "nature" | "festival" | "gaming" | "professional" | "romantic";

export type MessageSoundId =
  | "msg_default"
  | "msg_chime"
  | "msg_soft"
  | "msg_alert"
  | "msg_vip"
  | "msg_romantic"
  | "msg_business"
  | "msg_family"
  | "msg_office"
  | "msg_nature"
  | "msg_festival"
  | "msg_gaming";

export type CallSoundId =
  | "call_default"
  | "call_modern"
  | "call_soft"
  | "call_business"
  | "call_nature"
  | "call_musical"
  | "call_classic"
  | "none";

export type ContactSoundPresetId =
  | "default"
  | "romantic"
  | "professional"
  | "family"
  | "office"
  | "vip"
  | "nature"
  | "gaming";

export type SoundEntry = {
  id: string;
  label: string;
  subtitle?: string;
  pack?: SoundPackId;
  category: "message" | "call" | "effect";
};

/** Bundled WAV assets (generated via scripts/generate-premium-sounds.mjs). */
export const SOUND_ASSETS: Record<string, number> = {
  msg_default: require("../assets/sounds/msg_default.wav"),
  msg_chime: require("../assets/sounds/msg_chime.wav"),
  msg_soft: require("../assets/sounds/msg_soft.wav"),
  msg_alert: require("../assets/sounds/msg_alert.wav"),
  msg_vip: require("../assets/sounds/msg_vip.wav"),
  msg_romantic: require("../assets/sounds/msg_romantic.wav"),
  msg_business: require("../assets/sounds/msg_business.wav"),
  msg_family: require("../assets/sounds/msg_family.wav"),
  msg_office: require("../assets/sounds/msg_office.wav"),
  msg_nature: require("../assets/sounds/msg_nature.wav"),
  msg_festival: require("../assets/sounds/msg_festival.wav"),
  msg_gaming: require("../assets/sounds/msg_gaming.wav"),
  call_default: require("../assets/sounds/call_default.wav"),
  call_modern: require("../assets/sounds/call_modern.wav"),
  call_soft: require("../assets/sounds/call_soft.wav"),
  call_business: require("../assets/sounds/call_business.wav"),
  call_nature: require("../assets/sounds/call_nature.wav"),
  call_musical: require("../assets/sounds/call_musical.wav"),
  call_classic: require("../assets/sounds/call_classic.wav"),
  ringback: require("../assets/sounds/ringback.wav"),
  call_busy: require("../assets/sounds/call_busy.wav"),
  call_unavailable: require("../assets/sounds/call_unavailable.wav"),
  incoming_call: require("../assets/sounds/incoming_call.wav"),
};

export const SOUND_PACKS: Array<{
  id: SoundPackId;
  name: string;
  description: string;
  icon: string;
  color: string;
  messageSounds: MessageSoundId[];
}> = [
  {
    id: "modern",
    name: "Modern",
    description: "Clean chimes & alerts",
    icon: "sparkles-outline",
    color: "#6366F1",
    messageSounds: ["msg_chime", "msg_alert", "msg_vip"],
  },
  {
    id: "professional",
    name: "Professional",
    description: "Business & office tones",
    icon: "briefcase-outline",
    color: "#0EA5E9",
    messageSounds: ["msg_business", "msg_office", "msg_soft"],
  },
  {
    id: "romantic",
    name: "Romantic",
    description: "Soft tones for loved ones",
    icon: "heart-outline",
    color: "#EC4899",
    messageSounds: ["msg_romantic", "msg_soft"],
  },
  {
    id: "nature",
    name: "Nature",
    description: "Calm natural alerts",
    icon: "leaf-outline",
    color: "#22C55E",
    messageSounds: ["msg_nature", "msg_soft"],
  },
  {
    id: "festival",
    name: "Festival",
    description: "Celebration sounds",
    icon: "flame-outline",
    color: "#F59E0B",
    messageSounds: ["msg_festival", "msg_chime"],
  },
  {
    id: "gaming",
    name: "Gaming",
    description: "Short arcade-style pings",
    icon: "game-controller-outline",
    color: "#A855F7",
    messageSounds: ["msg_gaming", "msg_alert"],
  },
];

export const MESSAGE_SOUNDS: SoundEntry[] = [
  { id: "msg_default", label: "Default", category: "message" },
  { id: "msg_chime", label: "Modern chime", pack: "modern", category: "message" },
  { id: "msg_soft", label: "Soft ping", pack: "modern", category: "message" },
  { id: "msg_alert", label: "Short alert", pack: "modern", category: "message" },
  { id: "msg_vip", label: "VIP tone", pack: "modern", subtitle: "Premium alert", category: "message" },
  { id: "msg_romantic", label: "Romantic", pack: "romantic", category: "message" },
  { id: "msg_business", label: "Business", pack: "professional", category: "message" },
  { id: "msg_family", label: "Family", pack: "romantic", category: "message" },
  { id: "msg_office", label: "Office group", pack: "professional", category: "message" },
  { id: "msg_nature", label: "Nature", pack: "nature", category: "message" },
  { id: "msg_festival", label: "Festival", pack: "festival", category: "message" },
  { id: "msg_gaming", label: "Gaming ping", pack: "gaming", category: "message" },
];

export const CALL_RINGTONES: SoundEntry[] = [
  { id: "call_default", label: "Default", category: "call" },
  { id: "call_modern", label: "Modern tone", pack: "modern", category: "call" },
  { id: "call_soft", label: "Soft ring", pack: "romantic", category: "call" },
  { id: "call_business", label: "Business", pack: "professional", category: "call" },
  { id: "call_nature", label: "Nature", pack: "nature", category: "call" },
  { id: "call_musical", label: "Musical", pack: "modern", category: "call" },
  { id: "call_classic", label: "Classic", category: "call" },
  { id: "none", label: "Silent", category: "call" },
];

export const CONTACT_SOUND_PRESETS: Array<{
  id: ContactSoundPresetId;
  label: string;
  hint: string;
  icon: string;
  color: string;
  messageSoundId: MessageSoundId;
}> = [
  { id: "default", label: "Use global tone", hint: "Settings default", icon: "notifications-outline", color: "#8696A0", messageSoundId: "msg_default" },
  { id: "romantic", label: "Romantic", hint: "Partner / close friend", icon: "heart", color: "#EC4899", messageSoundId: "msg_romantic" },
  { id: "professional", label: "Professional", hint: "Boss / work", icon: "briefcase", color: "#0EA5E9", messageSoundId: "msg_business" },
  { id: "family", label: "Family", hint: "Family group", icon: "people", color: "#F59E0B", messageSoundId: "msg_family" },
  { id: "office", label: "Office group", hint: "Work groups", icon: "business", color: "#64748B", messageSoundId: "msg_office" },
  { id: "vip", label: "VIP", hint: "Important contacts", icon: "star", color: "#EAB308", messageSoundId: "msg_vip" },
  { id: "nature", label: "Nature", hint: "Calm tone", icon: "leaf", color: "#22C55E", messageSoundId: "msg_nature" },
  { id: "gaming", label: "Gaming", hint: "Fun ping", icon: "game-controller", color: "#A855F7", messageSoundId: "msg_gaming" },
];

export function labelForSoundId(id: string): string {
  const all = [...MESSAGE_SOUNDS, ...CALL_RINGTONES];
  return all.find((s) => s.id === id)?.label ?? id;
}

/** Android notification channel / iOS bundle sound name (no extension). */
export function notificationSoundFilename(soundId: MessageSoundId): string {
  if (soundId === "msg_default") return "default";
  return soundId;
}

export function isValidMessageSoundId(id: string): id is MessageSoundId {
  return MESSAGE_SOUNDS.some((s) => s.id === id);
}

export function isValidCallSoundId(id: string): id is CallSoundId {
  return CALL_RINGTONES.some((s) => s.id === id);
}

export function resolveLegacyCallRingtone(id: string): CallSoundId {
  if (id === "none") return "none";
  if (id === "classic") return "call_classic";
  if (id === "default") return "call_default";
  if (isValidCallSoundId(id)) return id;
  return "call_default";
}
