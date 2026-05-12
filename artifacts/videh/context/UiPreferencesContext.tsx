import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import { loadChatThemeChoice, saveChatThemeChoice, type ChatThemeChoice } from "@/lib/chatSettings";
import { translate } from "@/lib/i18n";
import { DEFAULT_APP_THEME_ID, getAppThemeById, type AppThemeOption } from "@/lib/appThemes";

const APP_LANGUAGE_KEY = "appLanguage";
const APP_THEME_ID_KEY = "appThemeId";
const APP_THEME_TRIAL_STARTED_KEY = "appThemeTrialStartedAt";

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
  prefsReady: boolean;
};

const UiPreferencesContext = createContext<UiPreferencesContextType | null>(null);

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState("en");
  const [chatThemeChoice, setChatThemeChoiceState] = useState<ChatThemeChoice>("system");
  const [appThemeId, setAppThemeIdState] = useState(DEFAULT_APP_THEME_ID);
  const [appThemeTrialStartedAt, setAppThemeTrialStartedAt] = useState<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lang, theme, storedThemeId, trialStartedAt] = await Promise.all([
          AsyncStorage.getItem(APP_LANGUAGE_KEY),
          loadChatThemeChoice(),
          AsyncStorage.getItem(APP_THEME_ID_KEY),
          AsyncStorage.getItem(APP_THEME_TRIAL_STARTED_KEY),
        ]);
        if (cancelled) return;
        if (lang) setLocaleState(lang);
        setChatThemeChoiceState(theme);
        setAppThemeIdState(getAppThemeById(storedThemeId).id);
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
  }, []);

  const t = useCallback((key: string) => translate(locale, key), [locale]);
  const appTheme = useMemo(() => getAppThemeById(appThemeId), [appThemeId]);

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
      prefsReady,
    }),
    [locale, setLocale, t, chatThemeChoice, setChatThemeChoice, appThemeId, appTheme, setAppThemeId, appThemeTrialStartedAt, prefsReady],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences(): UiPreferencesContextType {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  return ctx;
}
