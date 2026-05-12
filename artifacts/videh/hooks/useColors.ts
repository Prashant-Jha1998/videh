import { useColorScheme } from "react-native";
import colors from "@/constants/colors";
import { useUiPreferences } from "@/context/UiPreferencesContext";

type ColorScheme = typeof colors.light;

export function useColors(): ColorScheme & { isDark: boolean; radius: number; appThemeColors: [string, string] } {
  const scheme = useColorScheme();
  const { appTheme } = useUiPreferences();
  const isDark = scheme === "dark";
  const palette = isDark && "dark" in colors
    ? (colors as { dark: ColorScheme }).dark
    : colors.light;
  const [primary, secondary] = appTheme.colors;
  return {
    ...palette,
    tint: primary,
    primary,
    accent: primary,
    accentForeground: "#FFFFFF",
    headerBg: isDark ? palette.headerBg : primary,
    statusRing: primary,
    onlineGreen: primary,
    isDark,
    radius: colors.radius,
    appThemeColors: [primary, secondary],
  };
}
