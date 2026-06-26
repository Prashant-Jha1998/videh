import { useWindowDimensions } from "react-native";

export const THEME_GRID_COLUMNS = 3;
export const THEME_GRID_GAP = 10;
export const THEME_SECTION_H_PADDING = 16;

/** Pixel width for one theme card so exactly three fit per row (accounts for flex gap). */
export function useThemeGridCardWidth(
  columns = THEME_GRID_COLUMNS,
  horizontalPadding = THEME_SECTION_H_PADDING,
  gap = THEME_GRID_GAP,
) {
  const { width } = useWindowDimensions();
  const inner = width - horizontalPadding * 2;
  return Math.floor((inner - gap * (columns - 1)) / columns);
}
