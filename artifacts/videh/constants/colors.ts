import { VIDEH_BRAND } from "@/lib/brandColors";

const colors = {
  light: {
    text: "#111B21",
    tint: "#54656F",

    background: "#FFFFFF",
    foreground: "#111B21",

    card: "#FFFFFF",
    cardForeground: "#111B21",

    primary: "#54656F",
    primaryForeground: "#FFFFFF",

    secondary: "#F0F2F5",
    secondaryForeground: "#111B21",

    muted: "#F0F2F5",
    mutedForeground: "#667781",

    accent: "#F0F2F5",
    accentForeground: "#111B21",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: "#E9EDEF",
    input: "#E9EDEF",

    chatBubbleSent: "#E9EDEF",
    chatBubbleReceived: VIDEH_BRAND.receivedBubbleLight,
    chatBackground: "#F0F2F5",
    onlineGreen: VIDEH_BRAND.online,
    headerBg: "#FFFFFF",
    headerTitle: "#111B21",
    headerIcon: "#111B21",
    tabBar: "#FFFFFF",
    callBg: "#1A1A1A",
    statusRing: "#667781",
  },

  dark: {
    text: "#E9EDEF",
    tint: "#E9EDEF",

    background: VIDEH_BRAND.surfaceDark,
    foreground: "#E9EDEF",

    card: VIDEH_BRAND.cardDark,
    cardForeground: "#E9EDEF",

    primary: "#E9EDEF",
    primaryForeground: "#111B21",

    secondary: VIDEH_BRAND.borderDark,
    secondaryForeground: "#E9EDEF",

    muted: VIDEH_BRAND.borderDark,
    mutedForeground: VIDEH_BRAND.mutedDark,

    accent: VIDEH_BRAND.borderDark,
    accentForeground: "#E9EDEF",

    destructive: "#ef4444",
    destructiveForeground: "#ffffff",

    border: VIDEH_BRAND.borderDark,
    input: VIDEH_BRAND.borderDark,

    chatBubbleSent: "#2A3942",
    chatBubbleReceived: VIDEH_BRAND.receivedBubbleDark,
    chatBackground: VIDEH_BRAND.chatBgDark,
    onlineGreen: VIDEH_BRAND.online,
    headerBg: VIDEH_BRAND.cardDark,
    headerTitle: "#E9EDEF",
    headerIcon: "#E9EDEF",
    tabBar: VIDEH_BRAND.cardDark,
    callBg: VIDEH_BRAND.chatBgDark,
    statusRing: "#8696A0",
  },

  radius: 12,
};

export default colors;
