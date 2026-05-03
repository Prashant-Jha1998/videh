import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import { loadChatThemeChoice, saveChatThemeChoice, type ChatThemeChoice } from "@/lib/chatSettings";
import { translate } from "@/lib/i18n";

const APP_LANGUAGE_KEY = "appLanguage";

type UiPreferencesContextType = {
  locale: string;
  setLocale: (code: string) => Promise<void>;
  t: (key: string) => string;
  chatThemeChoice: ChatThemeChoice;
  setChatThemeChoice: (c: ChatThemeChoice) => Promise<void>;
  prefsReady: boolean;
};

const UiPreferencesContext = createContext<UiPreferencesContextType | null>(null);

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState("en");
  const [chatThemeChoice, setChatThemeChoiceState] = useState<ChatThemeChoice>("system");
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lang, theme] = await Promise.all([
          AsyncStorage.getItem(APP_LANGUAGE_KEY),
          loadChatThemeChoice(),
        ]);
        if (cancelled) return;
        if (lang) setLocaleState(lang);
        setChatThemeChoiceState(theme);
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

  const t = useCallback((key: string) => translate(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t, chatThemeChoice, setChatThemeChoice, prefsReady }),
    [locale, setLocale, t, chatThemeChoice, setChatThemeChoice, prefsReady],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences(): UiPreferencesContextType {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  return ctx;
}
