import { useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { getPerChatTheme, type PerChatThemeOverride } from "@/lib/perChatTheme";
import {
  bubbleOverrideFromPreset,
  CHAT_BUBBLE_PRESETS,
} from "@/lib/chatBubblePresets";
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

export function useChatAppearance(chatId: string | null | undefined): ChatAppearance {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const {
    appThemeId,
    chatWallpaperColor,
    globalAnimatedWallpaper,
    customBubbleOverride,
    perChatRevision,
  } = useUiPreferences();

  const [perChat, setPerChat] = useState<PerChatThemeOverride | null>(null);

  useEffect(() => {
    if (!chatId) {
      setPerChat(null);
      return;
    }
    let cancelled = false;
    void getPerChatTheme(chatId).then((v) => {
      if (!cancelled) setPerChat(v);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, perChatRevision]);

  return useMemo(() => {
    const themeId = perChat?.themeId ?? appThemeId;
    const appearance = getThemeAppearanceById(themeId);
    const bubbleOverride: BubbleOverride | null = (() => {
      if (perChat?.bubblePresetId) {
        const preset = CHAT_BUBBLE_PRESETS.find((p) => p.id === perChat.bubblePresetId);
        if (preset) return bubbleOverrideFromPreset(preset);
      }
      if (perChat?.bubbleSent || perChat?.bubbleReceived) {
        return {
          sentLight: perChat.bubbleSent,
          receivedLight: perChat.bubbleReceived ?? "#FFFFFF",
          sentDark: perChat.bubbleSentDark ?? perChat.bubbleSent,
          receivedDark: perChat.bubbleReceivedDark ?? perChat.bubbleReceived ?? "#1F2C34",
        };
      }
      return customBubbleOverride;
    })();

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
    perChatRevision,
  ]);
}
