import { Dimensions, Platform, StatusBar } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

const SCREEN_W = Dimensions.get("window").width;

/** in-stream video watch player — slightly taller than classic 16:9. */
export const REELS_WATCH_PLAYER_HEIGHT = Math.round((SCREEN_W * 11) / 16);

export function reelsWatchTopInset(insets: EdgeInsets): number {
  const androidBar = Platform.OS === "android" ? (StatusBar.currentHeight ?? 28) : 0;
  return Math.max(insets.top, androidBar);
}

export const reelsWatchPlayerSize = {
  width: "100%" as const,
  height: REELS_WATCH_PLAYER_HEIGHT,
};
