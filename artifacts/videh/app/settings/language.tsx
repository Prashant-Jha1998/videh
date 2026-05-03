import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { interpolate } from "@/lib/i18n";
import { getApiUrl } from "@/lib/api";
const API_URL = `${getApiUrl()}/api`;

const LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇬🇧" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", native: "বাংলা", flag: "🇮🇳" },
  { code: "te", name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { code: "ur", name: "Urdu", native: "اردو", flag: "🇵🇰" },
];

export default function LanguageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { t, locale, setLocale } = useUiPreferences();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [selectedLang, setSelectedLang] = useState("en");

  useEffect(() => {
    if (locale) setSelectedLang(locale);
  }, [locale]);

  const selectLanguage = async (code: string) => {
    setSelectedLang(code);
    await setLocale(code);
    if (user) {
      try {
        await fetch(`${API_URL}/users/${user.dbId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferredLang: code }),
        });
      } catch {}
    }
    const lang = LANGUAGES.find((l) => l.code === code);
    const body = interpolate(t("language.savedBody"), {
      name: lang?.name ?? code,
      native: lang?.native ?? "",
    });
    Alert.alert(t("language.savedTitle"), body, [{ text: t("common.ok"), onPress: () => router.back() }]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("language.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        <View style={[styles.infoBox, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>{t("language.info")}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {LANGUAGES.map((lang, i) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.langRow,
                i < LANGUAGES.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
              ]}
              onPress={() => selectLanguage(lang.code)}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{lang.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.langName, { color: colors.foreground }]}>{lang.name}</Text>
                <Text style={[styles.langNative, { color: colors.mutedForeground }]}>{lang.native}</Text>
              </View>
              {selectedLang === lang.code && (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, margin: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  section: { marginBottom: 10 },
  langRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  flag: { fontSize: 28 },
  langName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  langNative: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
});
