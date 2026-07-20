import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import {
  CHAT_STORAGE,
  fontSizeLabelToScale,
  loadChatThemeChoice,
  saveChatThemeChoice,
  wallpaperLabelToColor,
  type ChatThemeChoice,
} from "@/lib/chatSettings";
import { translate } from "@/lib/i18n";
import { loadAppIconStyle, saveAppIconStyle } from "@/lib/appIconPreference";
import { DEFAULT_APP_THEME_ID, getAppThemeById, type AppThemeOption } from "@/lib/appThemes";
import type { AnimatedWallpaperId, AppIconStyleId, BubbleOverride } from "@/lib/themeAppearance";
import { getThemeAppearanceById, resolveBubbles } from "@/lib/themeAppearance";

const APP_LANGUAGE_KEY = "appLanguage";
const APP_THEME_ID_KEY = "appThemeId";
const APP_THEME_EXPLICIT_KEY = "appThemeExplicitSelection";
const APP_THEME_TRIAL_STARTED_KEY = "appThemeTrialStartedAt";
const CUSTOM_BUBBLES_KEY = "videh_custom_bubble_colors_v1";
const GLOBAL_ANIMATED_WALLPAPER_KEY = "videh_global_animated_wallpaper_v1";

type UiPreferencesContextType = {
  locale: string;
  setLocale: (code: string) => Promise<void>;
  t: (key: string) => string;
  chatThemeChoice: ChatThemeChoice;
  setChatThemeChoice: (c: ChatThemeChoice) => Promise<void>;
  appThemeId: string;
  appTheme: AppThemeOption;
  setAppThemeId: (id: string) => Promise<void>;
  appThemeTrialStartedAt: string | null;
  chatFontLabel: string;
  chatFontScale: number;
  setChatFontLabel: (label: string) => Promise<void>;
  chatWallpaperLabel: string;
  chatWallpaperColor: string | null;
  setChatWallpaperLabel: (label: string) => Promise<void>;
  /** Global sent/received bubble override (Settings → Advanced theme). */
  customBubbleOverride: BubbleOverride | null;
  setCustomBubbleOverride: (o: BubbleOverride | null) => Promise<void>;
  globalAnimatedWallpaper: AnimatedWallpaperId;
  setGlobalAnimatedWallpaper: (id: AnimatedWallpaperId) => Promise<void>;
  appIconStyle: AppIconStyleId;
  setAppIconStyle: (id: AppIconStyleId) => Promise<void>;
  themeAppearance: ReturnType<typeof getThemeAppearanceById>;
  perChatRevision: number;
  refreshPerChatThemes: () => void;
  prefsReady: boolean;
};

const UiPreferencesContext = createContext<UiPreferencesContextType | null>(null);

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState("en");
  const [chatThemeChoice, setChatThemeChoiceState] = useState<ChatThemeChoice>("system");
  const [appThemeId, setAppThemeIdState] = useState(DEFAULT_APP_THEME_ID);
  const [appThemeTrialStartedAt, setAppThemeTrialStartedAt] = useState<string | null>(null);
  const [chatFontLabel, setChatFontLabelState] = useState("Medium");
  const [chatWallpaperLabel, setChatWallpaperLabelState] = useState("Default");
  const [customBubbleOverride, setCustomBubbleOverrideState] = useState<BubbleOverride | null>(null);
  const [globalAnimatedWallpaper, setGlobalAnimatedWallpaperState] = useState<AnimatedWallpaperId>("none");
  const [appIconStyle, setAppIconStyleState] = useState<AppIconStyleId>("default");
  const [perChatRevision, setPerChatRevision] = useState(0);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lang, theme, storedThemeId, themeExplicit, trialStartedAt, fontLabel, wallpaperLabel, customBubblesRaw, animWall, iconStyle] =
          await Promise.all([
          AsyncStorage.getItem(APP_LANGUAGE_KEY),
          loadChatThemeChoice(),
          AsyncStorage.getItem(APP_THEME_ID_KEY),
          AsyncStorage.getItem(APP_THEME_EXPLICIT_KEY),
          AsyncStorage.getItem(APP_THEME_TRIAL_STARTED_KEY),
          AsyncStorage.getItem(CHAT_STORAGE.fontSize),
          AsyncStorage.getItem(CHAT_STORAGE.wallpaper),
          AsyncStorage.getItem(CUSTOM_BUBBLES_KEY),
          AsyncStorage.getItem(GLOBAL_ANIMATED_WALLPAPER_KEY),
          loadAppIconStyle(),
        ]);
        if (cancelled) return;
        if (lang) setLocaleState(lang);
        setChatThemeChoiceState(theme);
        // Never-selected / legacy auto-default (videh-green without explicit pick) → Classic white/grey.
        const resolvedThemeId =
          !storedThemeId || (themeExplicit !== "1" && storedThemeId === "videh-green")
            ? DEFAULT_APP_THEME_ID
            : getAppThemeById(storedThemeId).id;
        setAppThemeIdState(resolvedThemeId);
        if (
          resolvedThemeId === DEFAULT_APP_THEME_ID
          && (storedThemeId === "videh-green" || storedThemeId == null)
          && themeExplicit !== "1"
        ) {
          await AsyncStorage.setItem(APP_THEME_ID_KEY, DEFAULT_APP_THEME_ID);
        }
        if (fontLabel) setChatFontLabelState(fontLabel);
        if (wallpaperLabel) setChatWallpaperLabelState(wallpaperLabel);
        if (customBubblesRaw) {
          try {
            const parsed = JSON.parse(customBubblesRaw) as BubbleOverride;
            if (parsed && typeof parsed === "object") setCustomBubbleOverrideState(parsed);
          } catch {
            /* ignore */
          }
        }
        if (
          animWall === "aurora"
          || animWall === "neon-pulse"
          || animWall === "sunset-flow"
          || animWall === "amoled-glow"
          || animWall === "festival-lights"
          || animWall === "none"
        ) {
          setGlobalAnimatedWallpaperState(animWall);
        }
        setAppIconStyleState(iconStyle);
        if (trialStartedAt) {
          setAppThemeTrialStartedAt(trialStartedAt);
        } else {
          const startedAt = new Date().toISOString();
          await AsyncStorage.setItem(APP_THEME_TRIAL_STARTED_KEY, startedAt);
          if (!cancelled) setAppThemeTrialStartedAt(startedAt);
        }
      } finally {
        if (!cancelled) setPrefsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(chatThemeChoice === "system" ? null : chatThemeChoice);
  }, [chatThemeChoice]);

  const setLocale = useCallback(async (code: string) => {
    setLocaleState(code);
    await AsyncStorage.setItem(APP_LANGUAGE_KEY, code);
  }, []);

  const setChatThemeChoice = useCallback(async (c: ChatThemeChoice) => {
    setChatThemeChoiceState(c);
    await saveChatThemeChoice(c);
  }, []);

  const setAppThemeId = useCallback(async (id: string) => {
    const next = getAppThemeById(id).id;
    setAppThemeIdState(next);
    await AsyncStorage.setItem(APP_THEME_ID_KEY, next);
    await AsyncStorage.setItem(APP_THEME_EXPLICIT_KEY, "1");
  }, []);

  const setChatFontLabel = useCallback(async (label: string) => {
    setChatFontLabelState(label);
    await AsyncStorage.setItem(CHAT_STORAGE.fontSize, label);
  }, []);

  const setChatWallpaperLabel = useCallback(async (label: string) => {
    setChatWallpaperLabelState(label);
    await AsyncStorage.setItem(CHAT_STORAGE.wallpaper, label);
  }, []);

  const setCustomBubbleOverride = useCallback(async (o: BubbleOverride | null) => {
    setCustomBubbleOverrideState(o);
    if (!o) {
      await AsyncStorage.removeItem(CUSTOM_BUBBLES_KEY);
      return;
    }
    await AsyncStorage.setItem(CUSTOM_BUBBLES_KEY, JSON.stringify(o));
  }, []);

  const setGlobalAnimatedWallpaper = useCallback(async (id: AnimatedWallpaperId) => {
    setGlobalAnimatedWallpaperState(id);
    await AsyncStorage.setItem(GLOBAL_ANIMATED_WALLPAPER_KEY, id);
  }, []);

  const setAppIconStyle = useCallback(async (id: AppIconStyleId) => {
    setAppIconStyleState(id);
    await saveAppIconStyle(id);
  }, []);

  const refreshPerChatThemes = useCallback(() => {
    setPerChatRevision((n) => n + 1);
  }, []);

  const t = useCallback((key: string) => translate(locale, key), [locale]);
  const appTheme = useMemo(() => getAppThemeById(appThemeId), [appThemeId]);
  const themeAppearance = useMemo(() => getThemeAppearanceById(appThemeId), [appThemeId]);
  const chatFontScale = useMemo(() => fontSizeLabelToScale(chatFontLabel), [chatFontLabel]);
  const chatWallpaperColor = useMemo(() => wallpaperLabelToColor(chatWallpaperLabel), [chatWallpaperLabel]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      chatThemeChoice,
      setChatThemeChoice,
      appThemeId,
      appTheme,
      setAppThemeId,
      appThemeTrialStartedAt,
      chatFontLabel,
      chatFontScale,
      setChatFontLabel,
      chatWallpaperLabel,
      chatWallpaperColor,
      setChatWallpaperLabel,
      customBubbleOverride,
      setCustomBubbleOverride,
      globalAnimatedWallpaper,
      setGlobalAnimatedWallpaper,
      appIconStyle,
      setAppIconStyle,
      themeAppearance,
      perChatRevision,
      refreshPerChatThemes,
      prefsReady,
    }),
    [
      locale, setLocale, t, chatThemeChoice, setChatThemeChoice, appThemeId, appTheme, setAppThemeId,
      appThemeTrialStartedAt, chatFontLabel, chatFontScale, setChatFontLabel, chatWallpaperLabel,
      chatWallpaperColor, setChatWallpaperLabel, customBubbleOverride, setCustomBubbleOverride,
      globalAnimatedWallpaper, setGlobalAnimatedWallpaper, appIconStyle, setAppIconStyle,
      themeAppearance, perChatRevision, refreshPerChatThemes, prefsReady,
    ],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences(): UiPreferencesContextType {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  return ctx;
}
