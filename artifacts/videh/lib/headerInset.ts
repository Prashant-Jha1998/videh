import { Platform, StatusBar as RNStatusBar } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

/** Top inset for app headers — works on edge-to-edge Android when insets.top is 0. */
export function headerTopInset(insets: EdgeInsets, webExtra = 0): number {
  const androidBar = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 28) : 0;
  const safeTop = Math.max(insets.top, androidBar);
  const extra = Platform.OS === "web" ? webExtra : 0;
  return safeTop + extra;
}
