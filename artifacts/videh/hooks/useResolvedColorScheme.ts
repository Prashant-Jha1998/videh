import { useColorScheme } from "react-native";
import { useUiPreferences } from "@/context/UiPreferencesContext";

/** Respects Settings → Chats → Theme (system / light / dark). */
export function useResolvedColorScheme(): "light" | "dark" {
  const system = useColorScheme();
  const { chatThemeChoice } = useUiPreferences();
  if (chatThemeChoice === "light") return "light";
  if (chatThemeChoice === "dark") return "dark";
  return system === "dark" ? "dark" : "light";
}
