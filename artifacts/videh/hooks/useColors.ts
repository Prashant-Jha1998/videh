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
  headerTitleColor: string;
  headerIconColor: string;
  headerSearchPlaceholder: string;
} {
  const scheme = useColorScheme();
  const { appTheme, themeAppearance, customBubbleOverride } = useUiPreferences();
  const isDark = scheme === "dark";
  const palette = isDark && "dark" in colors
    ? (colors as { dark: ColorScheme }).dark
    : colors.light;
  const [primary, secondary] = appTheme.colors;
  const bubbles = resolveBubbles(themeAppearance, isDark, customBubbleOverride);
  const headerOnLight = !isDark;
  return {
    ...palette,
    tint: primary,
    primary,
    accent: headerOnLight ? palette.accent : primary,
    accentForeground: headerOnLight ? palette.accentForeground : "#FFFFFF",
    headerBg: palette.headerBg,
    headerTitleColor: headerOnLight ? primary : palette.headerTitle,
    headerIconColor: palette.headerIcon,
    headerSearchPlaceholder: headerOnLight ? "rgba(102,119,129,0.85)" : "rgba(255,255,255,0.65)",
    statusRing: primary,
    onlineGreen: primary,
    chatBubbleSent: bubbles.sent,
    chatBubbleReceived: bubbles.received,
    isDark,
    radius: colors.radius,
    appThemeColors: [primary, secondary],
  };
}
