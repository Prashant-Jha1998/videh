import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { useResolvedColorScheme } from "@/hooks/useResolvedColorScheme";
import { getPerChatTheme, type PerChatThemeOverride } from "@/lib/perChatTheme";
import {
  getThemeAppearanceById,
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

  const reloadPerChat = useCallback(() => {
    if (!chatId) {
      setPerChat(null);
      return;
    }
    void getPerChatTheme(chatId).then((v) => {
      setPerChat(v);
    });
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      reloadPerChat();
    }, [reloadPerChat, perChatRevision]),
  );

  return useMemo(() => {
    const themeId = perChat?.themeId ?? appThemeId;
    const appearance = getThemeAppearanceById(themeId);
    const bubbleOverride = perChatBubbleOverride(perChat) ?? customBubbleOverride;

    const { sent, received } = resolveBubbles(appearance, isDark, bubbleOverride);
    const animatedWallpaper =
      perChat?.animatedWallpaper
      ?? appearance.animatedWallpaper
      ?? globalAnimatedWallpaper
      ?? "none";

    return {
      appearance,
      chatBubbleSent: sent,
      chatBubbleReceived: received,
      chatBackground: resolveChatBackground(appearance, isDark, chatWallpaperColor),
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
  ]);
}
