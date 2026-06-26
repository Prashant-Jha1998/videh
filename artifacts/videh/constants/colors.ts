import { VIDEH_BRAND } from "@/lib/brandColors";

const colors = {
  light: {
    text: "#111111",
    tint: VIDEH_BRAND.primary,

    background: "#FFFFFF",
    foreground: "#111111",

    card: "#F7F8F9",
    cardForeground: "#111111",

    primary: VIDEH_BRAND.primary,
    primaryForeground: "#FFFFFF",

    secondary: "#F0F2F5",
    secondaryForeground: "#1a1a1a",

    muted: "#F0F2F5",
    mutedForeground: "#667781",

    accent: VIDEH_BRAND.accentTint,
    accentForeground: VIDEH_BRAND.primary,

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "#E9EDEF",
    input: "#E9EDEF",

    chatBubbleSent: VIDEH_BRAND.sentBubbleLight,
    chatBubbleReceived: VIDEH_BRAND.receivedBubbleLight,
    chatBackground: VIDEH_BRAND.chatBgLight,
    onlineGreen: VIDEH_BRAND.online,
    headerBg: VIDEH_BRAND.primary,
    tabBar: "#FFFFFF",
    callBg: "#1A1A1A",
    statusRing: VIDEH_BRAND.primaryLight,
  },

  dark: {
    text: "#E9EDEF",
    tint: VIDEH_BRAND.primaryLight,

    background: VIDEH_BRAND.surfaceDark,
    foreground: "#E9EDEF",

    card: VIDEH_BRAND.cardDark,
    cardForeground: "#E9EDEF",

    primary: VIDEH_BRAND.primaryLight,
    primaryForeground: "#FFFFFF",

    secondary: VIDEH_BRAND.borderDark,
    secondaryForeground: "#E9EDEF",

    muted: VIDEH_BRAND.borderDark,
    mutedForeground: VIDEH_BRAND.mutedDark,

    accent: VIDEH_BRAND.primary,
    accentForeground: "#FFFFFF",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: VIDEH_BRAND.borderDark,
    input: VIDEH_BRAND.borderDark,

    chatBubbleSent: VIDEH_BRAND.sentBubbleDark,
    chatBubbleReceived: VIDEH_BRAND.receivedBubbleDark,
    chatBackground: VIDEH_BRAND.chatBgDark,
    onlineGreen: VIDEH_BRAND.online,
    headerBg: VIDEH_BRAND.cardDark,
    tabBar: VIDEH_BRAND.cardDark,
    callBg: VIDEH_BRAND.chatBgDark,
    statusRing: VIDEH_BRAND.primaryLight,
  },

  radius: 12,
};

export default colors;
