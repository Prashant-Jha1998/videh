import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { useResolvedColorScheme } from "@/hooks/useResolvedColorScheme";
import { getPerChatTheme, type PerChatThemeOverride } from "@/lib/perChatTheme";
import { DEFAULT_APP_THEME_ID } from "@/lib/appThemes";
import {
  getThemeAppearanceById,
  mixHex,
  resolveBubbles,
  type AnimatedWallpaperId,
  type BubbleOverride,
  type ThemeAppearance,
} from "@/lib/themeAppearance";

/** Classic unthemed chat canvas (no per-chat theme applied). */
const DEFAULT_CHAT_BG_LIGHT = "#F0F2F5";
const DEFAULT_CHAT_BG_DARK = "#0B141A";
const DEFAULT_SENT_LIGHT = "#E9EDEF";
const DEFAULT_SENT_DARK = "#2A3942";
const DEFAULT_RECEIVED_LIGHT = "#FFFFFF";
const DEFAULT_RECEIVED_DARK = "#1F2C34";

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
    const hasPerChatTheme = Boolean(
      perChat?.themeId && perChat.themeId !== DEFAULT_APP_THEME_ID,
    );

    // No per-chat theme → classic white/grey chat (ignore global app theme / wallpaper / custom bubbles).
    if (!hasPerChatTheme) {
      const appearance = getThemeAppearanceById(DEFAULT_APP_THEME_ID);
      return {
        appearance,
        chatBubbleSent: isDark ? DEFAULT_SENT_DARK : DEFAULT_SENT_LIGHT,
        chatBubbleReceived: isDark ? DEFAULT_RECEIVED_DARK : DEFAULT_RECEIVED_LIGHT,
        chatBackground: isDark ? DEFAULT_CHAT_BG_DARK : DEFAULT_CHAT_BG_LIGHT,
        animatedWallpaper: "none" as AnimatedWallpaperId,
        perChatOverride: perChat,
        isDark,
      };
    }

    const themeId = perChat!.themeId!;
    const appearance = getThemeAppearanceById(themeId);
    const bubbleOverride = perChatBubbleOverride(perChat) ?? customBubbleOverride;
    const accent = appearance.accent[0];

    let { sent, received } = resolveBubbles(appearance, isDark, bubbleOverride);
    // Accent-only per-chat save uses very pale derived bubbles — strengthen so the theme is visible.
    if (!perChatBubbleOverride(perChat)) {
      sent = isDark ? mixHex(accent, "#12101F", 0.42) : mixHex(accent, "#FFFFFF", 0.52);
      received = isDark ? "#1E1D2E" : "#FFFFFF";
    }

    const animatedWallpaper =
      perChat?.animatedWallpaper
      ?? appearance.animatedWallpaper
      ?? globalAnimatedWallpaper
      ?? "none";

    const chatBackground = isDark
      ? mixHex(accent, "#12101F", 0.82)
      : mixHex(accent, "#F7F5FF", 0.86);

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
    globalAnimatedWallpaper,
    customBubbleOverride,
    isDark,
    chatId,
  ]);
}
