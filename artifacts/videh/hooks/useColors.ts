import { useColorScheme } from "react-native";
import colors from "@/constants/colors";

type ColorScheme = typeof colors.light;

export function useColors(): ColorScheme & { isDark: boolean; radius: number } {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const palette = isDark && "dark" in colors
    ? (colors as { dark: ColorScheme }).dark
    : colors.light;
  return { ...palette, isDark, radius: colors.radius };
}
