import { useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { resolveBubbles } from "@/lib/themeAppearance";

type ColorScheme = typeof colors.light;

export function useColors(): ColorScheme & {
  isDark: boolean;
  radius: number;
  appThemeColors: [string, string];
  chatBubbleSent: string;
  chatBubbleReceived: string;
} {
  const scheme = useColorScheme();
  const { appTheme, themeAppearance, customBubbleOverride } = useUiPreferences();
  const isDark = scheme === "dark";
  const palette = isDark && "dark" in colors
    ? (colors as { dark: ColorScheme }).dark
    : colors.light;
  const [primary, secondary] = appTheme.colors;
  const bubbles = resolveBubbles(themeAppearance, isDark, customBubbleOverride);
  return {
    ...palette,
    tint: primary,
    primary,
    accent: primary,
    accentForeground: "#FFFFFF",
    headerBg: isDark ? palette.headerBg : primary,
    statusRing: primary,
    onlineGreen: primary,
    chatBubbleSent: bubbles.sent,
    chatBubbleReceived: bubbles.received,
    isDark,
    radius: colors.radius,
    appThemeColors: [primary, secondary],
  };
}
