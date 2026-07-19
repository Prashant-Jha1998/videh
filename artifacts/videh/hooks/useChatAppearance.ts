import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { useResolvedColorScheme } from "@/hooks/useResolvedColorScheme";
import { getPerChatTheme, type PerChatThemeOverride } from "@/lib/perChatTheme";
import {
  getThemeAppearanceById,
  mixHex,
  resolveBubbles,
  resolveChatBackground,
  type AnimatedWallpaperId,
  type BubbleOverride,
  type ThemeAppearance,
} from "@/lib/themeAppearance";

export type ChatAppearance = {
  appearance: ThemeAppearance;
  chatBubbleSent: string;
  chatBubbleReceived: string;
  chatBackground: string;
  animatedWallpaper: AnimatedWallpaperId;
  perChatOverride: PerChatThemeOverride | null;
  isDark: boolean;
};

function perChatBubbleOverride(perChat: PerChatThemeOverride | null): BubbleOverride | null {
  if (!perChat?.bubbleSent && !perChat?.bubbleReceived) return null;
  return {
    sentLight: perChat.bubbleSent,
    receivedLight: perChat.bubbleReceived,
    sentDark: perChat.bubbleSent,
    receivedDark: perChat.bubbleReceived,
  };
}

export function useChatAppearance(chatId: string | null | undefined): ChatAppearance {
  const scheme = useResolvedColorScheme();
  const isDark = scheme === "dark";
  const {
    appThemeId,
    chatWallpaperColor,
    globalAnimatedWallpaper,
    customBubbleOverride,
    perChatRevision,
  } = useUiPreferences();

  const [perChat, setPerChat] = useState<PerChatThemeOverride | null>(null);
  const loadSeqRef = useRef(0);

  const reloadPerChat = useCallback(() => {
    if (!chatId) {
      setPerChat(null);
      return;
    }
    const seq = ++loadSeqRef.current;
    void getPerChatTheme(chatId).then((v) => {
      if (seq !== loadSeqRef.current) return;
      setPerChat(v);
    });
  }, [chatId]);

  useEffect(() => {
    loadSeqRef.current += 1;
    if (!chatId) {
      setPerChat(null);
      return;
    }
    const seq = loadSeqRef.current;
    void getPerChatTheme(chatId).then((v) => {
      if (seq !== loadSeqRef.current) return;
      setPerChat(v);
    });
  }, [chatId, perChatRevision]);

  useFocusEffect(
    useCallback(() => {
      reloadPerChat();
    }, [reloadPerChat, perChatRevision]),
  );

  return useMemo(() => {
    const themeId = perChat?.themeId ?? appThemeId;
    const appearance = getThemeAppearanceById(themeId);
    const bubbleOverride = perChatBubbleOverride(perChat) ?? customBubbleOverride;
    const accent = appearance.accent[0];
    const hasPerChatTheme = Boolean(perChat?.themeId);

    let { sent, received } = resolveBubbles(appearance, isDark, bubbleOverride);
    // Accent-only per-chat save uses very pale derived bubbles — strengthen so the theme is visible.
    if (hasPerChatTheme && !perChatBubbleOverride(perChat)) {
      sent = isDark ? mixHex(accent, "#12101F", 0.42) : mixHex(accent, "#FFFFFF", 0.52);
      received = isDark ? "#1E1D2E" : "#FFFFFF";
    }

    const animatedWallpaper =
      perChat?.animatedWallpaper
      ?? appearance.animatedWallpaper
      ?? globalAnimatedWallpaper
      ?? "none";

    // Per-chat accent must tint the background; do not let global wallpaper color override it.
    const chatBackground = hasPerChatTheme
      ? (isDark ? mixHex(accent, "#12101F", 0.82) : mixHex(accent, "#F7F5FF", 0.86))
      : resolveChatBackground(appearance, isDark, chatWallpaperColor);

    if (__DEV__) {
      console.log(
        `[chat-theme] apply chatId=${chatId ?? "null"} themeId=${themeId} perChat=${hasPerChatTheme} bg=${chatBackground} sent=${sent}`,
      );
    }

    return {
      appearance,
      chatBubbleSent: sent,
      chatBubbleReceived: received,
      chatBackground,
      animatedWallpaper,
      perChatOverride: perChat,
      isDark,
    };
  }, [
    perChat,
    appThemeId,
    chatWallpaperColor,
    globalAnimatedWallpaper,
    customBubbleOverride,
    isDark,
    chatId,
  ]);
}
