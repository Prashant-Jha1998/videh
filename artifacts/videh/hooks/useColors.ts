import colors from "@/constants/colors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { useResolvedColorScheme } from "@/hooks/useResolvedColorScheme";
import { DEFAULT_APP_THEME_ID } from "@/lib/appThemes";
import { VIDEH_BRAND } from "@/lib/brandColors";
import { mixHex, resolveBubbles } from "@/lib/themeAppearance";

type ColorScheme = typeof colors.light;

export function useColors(): ColorScheme & {
  isDark: boolean;
  radius: number;
  appThemeColors: [string, string];
  /** True when user picked a non-default app theme (headers & shell tint apply). */
  shellThemed: boolean;
  chatBubbleSent: string;
  chatBubbleReceived: string;
  headerTitleColor: string;
  headerIconColor: string;
  headerSearchPlaceholder: string;
} {
  const scheme = useResolvedColorScheme();
  const { appTheme, appThemeId, themeAppearance, customBubbleOverride } = useUiPreferences();
  const isDark = scheme === "dark";
  const palette = isDark && "dark" in colors
    ? (colors as { dark: ColorScheme }).dark
    : colors.light;
  const [primary, secondary] = appTheme.colors;
  const shellThemed = appThemeId !== DEFAULT_APP_THEME_ID;
  const bubbles = resolveBubbles(themeAppearance, isDark, customBubbleOverride);
  const headerOnLight = !isDark;
  const onThemedHeader = shellThemed;
  const shellBackground = shellThemed
    ? mixHex(primary, palette.background, isDark ? 0.9 : 0.97)
    : palette.background;
  const shellHeaderBg = shellThemed ? primary : palette.headerBg;
  const shellTabBar = shellThemed
    ? mixHex(primary, palette.tabBar, isDark ? 0.82 : 0.94)
    : palette.tabBar;
  return {
    ...palette,
    background: shellBackground,
    tint: primary,
    primary,
    accent: headerOnLight && !shellThemed ? palette.accent : primary,
    accentForeground: headerOnLight && !shellThemed ? palette.accentForeground : "#FFFFFF",
    headerBg: shellHeaderBg,
    tabBar: shellTabBar,
    headerTitleColor: onThemedHeader
      ? "#FFFFFF"
      : headerOnLight
        ? primary
        : palette.headerTitle,
    headerIconColor: onThemedHeader ? "#FFFFFF" : palette.headerIcon,
    headerSearchPlaceholder: onThemedHeader
      ? "rgba(255,255,255,0.72)"
      : headerOnLight
        ? "rgba(102,119,129,0.85)"
        : "rgba(255,255,255,0.65)",
    statusRing: primary,
    onlineGreen: VIDEH_BRAND.online,
    chatBubbleSent: bubbles.sent,
    chatBubbleReceived: bubbles.received,
    isDark,
    radius: colors.radius,
    appThemeColors: [primary, secondary],
    shellThemed,
  };
}
