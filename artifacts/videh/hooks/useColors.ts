import colors from "@/constants/colors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { useResolvedColorScheme } from "@/hooks/useResolvedColorScheme";
import { isColoredAppTheme } from "@/lib/appThemes";
import { VIDEH_BRAND } from "@/lib/brandColors";
import { mixHex, resolveBubbles } from "@/lib/themeAppearance";

type ColorScheme = typeof colors.light;

export function useColors(): ColorScheme & {
  isDark: boolean;
  radius: number;
  appThemeColors: [string, string];
  /** True when user picked a non-classic app theme (headers & shell tint apply). */
  shellThemed: boolean;
  chatBubbleSent: string;
  chatBubbleReceived: string;
  headerTitleColor: string;
  /** Brand wordmark color (e.g. "Videh" on chats list) — green on White & Grey. */
  brandTitleColor: string;
  headerIconColor: string;
  headerSearchPlaceholder: string;
} {
  const scheme = useResolvedColorScheme();
  const { appTheme, appThemeId, themeAppearance, customBubbleOverride } = useUiPreferences();
  const isDark = scheme === "dark";
  const palette = isDark && "dark" in colors
    ? (colors as { dark: ColorScheme }).dark
    : colors.light;
  const shellThemed = isColoredAppTheme(appThemeId);
  const [themePrimary, themeSecondary] = appTheme.colors;
  // White & Grey (classic): white/grey chrome + Videh green accents (not green headers).
  const primary = shellThemed ? themePrimary : VIDEH_BRAND.primary;
  const secondary = shellThemed ? themeSecondary : (isDark ? VIDEH_BRAND.accentTintDark : VIDEH_BRAND.accentTint);
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
  const classicChatBg = isDark ? "#0B141A" : "#F0F2F5";
  const classicSent = isDark ? VIDEH_BRAND.sentBubbleDark : VIDEH_BRAND.sentBubbleLight;
  const classicReceived = isDark ? VIDEH_BRAND.receivedBubbleDark : VIDEH_BRAND.receivedBubbleLight;

  return {
    ...palette,
    background: shellBackground,
    tint: primary,
    primary,
    // Active filters: pale green chip + dark green label (WhatsApp-like).
    accent: shellThemed
      ? primary
      : (headerOnLight ? VIDEH_BRAND.accentTint : VIDEH_BRAND.accentTintDark),
    accentForeground: shellThemed
      ? "#FFFFFF"
      : (headerOnLight ? VIDEH_BRAND.primaryDark : "#ECFDF5"),
    headerBg: shellHeaderBg,
    tabBar: shellTabBar,
    headerTitleColor: onThemedHeader
      ? "#FFFFFF"
      : headerOnLight
        ? "#111B21"
        : palette.headerTitle,
    brandTitleColor: onThemedHeader
      ? "#FFFFFF"
      : headerOnLight
        ? VIDEH_BRAND.primary
        : VIDEH_BRAND.primaryLight,
    headerIconColor: onThemedHeader ? "#FFFFFF" : palette.headerIcon,
    headerSearchPlaceholder: onThemedHeader
      ? "rgba(255,255,255,0.72)"
      : headerOnLight
        ? "rgba(102,119,129,0.85)"
        : "rgba(255,255,255,0.65)",
    statusRing: shellThemed ? primary : (isDark ? VIDEH_BRAND.primaryLight : VIDEH_BRAND.primary),
    onlineGreen: VIDEH_BRAND.online,
    chatBubbleSent: shellThemed ? bubbles.sent : classicSent,
    chatBubbleReceived: shellThemed ? bubbles.received : classicReceived,
    chatBackground: shellThemed
      ? (isDark ? themeAppearance.chatBackgroundDark : themeAppearance.chatBackgroundLight)
      : classicChatBg,
    isDark,
    radius: colors.radius,
    appThemeColors: [primary, secondary],
    shellThemed,
  };
}
