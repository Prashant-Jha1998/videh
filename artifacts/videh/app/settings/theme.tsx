import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { ThemedHeader } from "@/components/ThemedHeader";
import {
  APP_THEME_OPTIONS,
  GRADIENT_APP_THEMES,
  SOLID_APP_THEMES,
  daysLeftInThemeTrial,
  type AppThemeOption,
} from "@/lib/appThemes";

export default function AppThemeSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { appThemeId, appTheme, setAppThemeId, appThemeTrialStartedAt } = useUiPreferences();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const trialDaysLeft = daysLeftInThemeTrial(appThemeTrialStartedAt);
  const selectedTheme = useMemo(
    () => APP_THEME_OPTIONS.find((theme) => theme.id === appThemeId) ?? appTheme,
    [appTheme, appThemeId],
  );

  const renderTheme = (theme: AppThemeOption) => {
    const selected = theme.id === appThemeId;
    return (
      <TouchableOpacity
        key={theme.id}
        style={[
          styles.themeCard,
          { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
          selected && styles.themeCardSelected,
        ]}
        onPress={() => {
          if (trialDaysLeft <= 0 && !selected) {
            Alert.alert("Theme subscription required", "Your free year has ended. A paid theme subscription is required to switch themes.");
            return;
          }
          void setAppThemeId(theme.id);
        }}
        activeOpacity={0.78}
      >
        <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch}>
          {selected ? (
            <View style={styles.selectedBadge}>
              <Ionicons name="checkmark" size={15} color="#fff" />
            </View>
          ) : null}
        </LinearGradient>
        <Text style={[styles.themeName, { color: colors.foreground }]} numberOfLines={1}>
          {theme.name}
        </Text>
        <Text style={[styles.themeType, { color: colors.mutedForeground }]}>
          {theme.kind === "gradient" ? "Gradient" : "Solid"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ThemedHeader style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Theme</Text>
        <View style={{ width: 40 }} />
      </ThemedHeader>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
        <LinearGradient colors={selectedTheme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroLabel}>Current Theme</Text>
          <Text style={styles.heroTitle}>{selectedTheme.name}</Text>
          <Text style={styles.heroSub}>
            All solid and gradient themes are free for 1 year. After that, switching themes requires a paid theme subscription.
          </Text>
        </LinearGradient>

        <View style={[styles.trialBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="sparkles-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.trialTitle, { color: colors.foreground }]}>Theme trial</Text>
            <Text style={[styles.trialText, { color: colors.mutedForeground }]}>
              {trialDaysLeft > 0
                ? `${trialDaysLeft} days free remaining. Every theme stays unlocked during this period.`
                : "Your free year has ended. Themes are ready for a future paid plan."}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Solid Colors</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>20 free color themes</Text>
          <View style={styles.grid}>{SOLID_APP_THEMES.map(renderTheme)}</View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Gradient Colors</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>30 free gradient themes</Text>
          <View style={styles.grid}>{GRADIENT_APP_THEMES.map(renderTheme)}</View>
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
  hero: { margin: 16, borderRadius: 24, padding: 22, minHeight: 150, justifyContent: "flex-end" },
  heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  heroTitle: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", marginTop: 8 },
  heroSub: { color: "rgba(255,255,255,0.86)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 8 },
  trialBox: { marginHorizontal: 16, marginBottom: 8, borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: "row", gap: 12 },
  trialTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 3 },
  trialText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  section: { paddingHorizontal: 16, paddingTop: 18 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeCard: { width: "31.6%", borderWidth: 1, borderRadius: 16, padding: 8 },
  themeCardSelected: { borderWidth: 2 },
  swatch: { height: 54, borderRadius: 12, marginBottom: 8, alignItems: "flex-end", justifyContent: "flex-start", padding: 6 },
  selectedBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  themeName: { fontSize: 12, fontFamily: "Inter_700Bold" },
  themeType: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
});
