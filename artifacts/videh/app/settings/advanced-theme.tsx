import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { ThemedHeader } from "@/components/ThemedHeader";
import { useColors } from "@/hooks/useColors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { appIconChangeSupported } from "@/lib/appIconPreference";
import {
  APP_THEME_OPTIONS,
  daysLeftInThemeTrial,
  type AppThemeOption,
} from "@/lib/appThemes";
import {
  ANIMATED_WALLPAPERS,
  APP_ICON_STYLES,
  THEME_PACK_META,
  getThemeAppearanceById,
  listAppearancesByPack,
  listPremiumPacks,
  type ThemeAppearance,
  type ThemePackId,
} from "@/lib/themeAppearance";

const BUBBLE_PRESETS: { name: string; sent: string; received: string }[] = [
  { name: "Classic", sent: "#D9FDD3", received: "#FFFFFF" },
  { name: "Blue", sent: "#DBEAFE", received: "#FFFFFF" },
  { name: "Purple", sent: "#EDE9FE", received: "#FFFFFF" },
  { name: "Pink", sent: "#FCE7F3", received: "#FFFFFF" },
  { name: "Orange", sent: "#FFEDD5", received: "#FFFFFF" },
  { name: "Red", sent: "#FEE2E2", received: "#FFFFFF" },
  { name: "Grey", sent: "#E5E7EB", received: "#FFFFFF" },
  { name: "Dark sent", sent: "#005C4B", received: "#1F2C34" },
];

export default function AdvancedThemeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    appThemeId,
    setAppThemeId,
    appThemeTrialStartedAt,
    customBubbleOverride,
    setCustomBubbleOverride,
    globalAnimatedWallpaper,
    setGlobalAnimatedWallpaper,
    appIconStyle,
    setAppIconStyle,
    themeAppearance,
  } = useUiPreferences();

  const [packFilter, setPackFilter] = useState<ThemePackId | "all">("all");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const trialDaysLeft = daysLeftInThemeTrial(appThemeTrialStartedAt);
  const premiumPacks = useMemo(() => listPremiumPacks(), []);

  const filteredThemes = useMemo(() => {
    if (packFilter === "all") return APP_THEME_OPTIONS;
    if (packFilter === "custom") return [];
    const ids = new Set(listAppearancesByPack(packFilter).map((a) => a.id));
    return APP_THEME_OPTIONS.filter((t) => ids.has(t.id));
  }, [packFilter]);

  const renderTheme = (theme: AppThemeOption | ThemeAppearance) => {
    const selected = theme.id === appThemeId;
    const gradientColors = "colors" in theme ? theme.colors : theme.accent;
    return (
      <TouchableOpacity
        key={theme.id}
        style={[
          styles.themeCard,
          { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
        ]}
        onPress={() => {
          if (trialDaysLeft <= 0 && !selected) {
            Alert.alert("Theme trial ended", "Premium theme packs will unlock with a future subscription.");
            return;
          }
          void setAppThemeId(theme.id);
        }}
      >
        <LinearGradient colors={gradientColors} style={styles.swatch} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {selected ? (
            <View style={styles.check}>
              <Ionicons name="checkmark" size={14} color="#fff" />
            </View>
          ) : null}
        </LinearGradient>
        <Text style={[styles.cardLabel, { color: colors.foreground }]} numberOfLines={1}>{theme.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ThemedHeader style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Advanced Theme</Text>
        <View style={{ width: 40 }} />
      </ThemedHeader>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <LinearGradient
          colors={themeAppearance.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>Whole app look</Text>
          <Text style={styles.heroSub}>
            Accent, chat bubbles, badges, and chat backgrounds change together — like Meta advanced themes.
          </Text>
        </LinearGradient>

        <Section title="1. Chat bubble colors" colors={colors}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Sent and received message bubbles (global). Per-chat overrides: open a chat → info → Chat theme.
          </Text>
          <View style={styles.bubbleRow}>
            {BUBBLE_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.name}
                style={[styles.bubblePreset, { borderColor: colors.border }]}
                onPress={() => {
                  void setCustomBubbleOverride({
                    sentLight: p.sent,
                    receivedLight: p.received,
                    sentDark: p.sent,
                    receivedDark: p.received,
                  });
                }}
              >
                <View style={[styles.bubbleMini, { backgroundColor: p.sent }]} />
                <View style={[styles.bubbleMini, { backgroundColor: p.received, marginLeft: 4 }]} />
                <Text style={[styles.bubbleName, { color: colors.mutedForeground }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => void setCustomBubbleOverride(null)}
            style={[styles.resetBtn, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Use theme default bubbles</Text>
          </TouchableOpacity>
        </Section>

        <Section title="2. App accent color" colors={colors}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.packScroll}>
            <PackChip label="All" active={packFilter === "all"} onPress={() => setPackFilter("all")} colors={colors} />
            {(Object.keys(THEME_PACK_META) as ThemePackId[]).map((id) => (
              <PackChip
                key={id}
                label={THEME_PACK_META[id].title}
                active={packFilter === id}
                onPress={() => setPackFilter(id)}
                colors={colors}
              />
            ))}
          </ScrollView>
          <View style={styles.grid}>
            {(packFilter === "all" ? APP_THEME_OPTIONS : filteredThemes).slice(0, 24).map(renderTheme)}
          </View>
          <TouchableOpacity onPress={() => router.push("/settings/theme")} style={styles.linkRow}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>See all 50+ themes</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </Section>

        <Section title="3. Premium theme packs" colors={colors}>
          {premiumPacks.map(({ pack, themes }) => (
            <View key={pack} style={[styles.packBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.packHead}>
                <Ionicons name={THEME_PACK_META[pack].icon as any} size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.packTitle, { color: colors.foreground }]}>{THEME_PACK_META[pack].title}</Text>
                  <Text style={[styles.packSub, { color: colors.mutedForeground }]}>{THEME_PACK_META[pack].subtitle}</Text>
                </View>
              </View>
              <View style={styles.grid}>{themes.map(renderTheme)}</View>
            </View>
          ))}
        </Section>

        <Section title="4. Animated backgrounds" colors={colors}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Moving gradients behind chats (when no custom photo wallpaper).
          </Text>
          <View style={styles.animRow}>
            {ANIMATED_WALLPAPERS.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[
                  styles.animChip,
                  {
                    backgroundColor: colors.card,
                    borderColor: globalAnimatedWallpaper === w.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => void setGlobalAnimatedWallpaper(w.id)}
              >
                <Text style={[styles.animLabel, { color: colors.foreground }]}>{w.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section title="5. App icon (home screen)" colors={colors}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {appIconChangeSupported()
              ? "Your choice is saved. Alternate icon assets ship in the next native build."
              : "Available on mobile."}
          </Text>
          <View style={styles.iconRow}>
            {APP_ICON_STYLES.map((icon) => (
              <TouchableOpacity
                key={icon.id}
                style={[
                  styles.iconChip,
                  { borderColor: appIconStyle === icon.id ? colors.primary : colors.border },
                ]}
                onPress={() => void setAppIconStyle(icon.id)}
              >
                <View style={[styles.iconDot, { backgroundColor: icon.color }]} />
                <Text style={[styles.iconLabel, { color: colors.foreground }]}>{icon.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.primary }]}>{title}</Text>
      {children}
    </View>
  );
}

function PackChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.packChip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={{ color: active ? "#fff" : colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  hero: { margin: 16, borderRadius: 16, padding: 20 },
  heroTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 8, lineHeight: 20 },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeCard: { width: "30%", minWidth: 96, borderRadius: 12, borderWidth: 1.5, padding: 8, alignItems: "center" },
  swatch: { width: "100%", aspectRatio: 1, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: 11, marginTop: 6, fontFamily: "Inter_500Medium" },
  bubbleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bubblePreset: { alignItems: "center", padding: 8, borderRadius: 10, borderWidth: 1, width: "23%" },
  bubbleMini: { width: 22, height: 14, borderRadius: 6 },
  bubbleName: { fontSize: 9, marginTop: 4 },
  resetBtn: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  packScroll: { marginBottom: 12 },
  packChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12 },
  packBlock: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  packHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  packTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  packSub: { fontSize: 12 },
  animRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  animChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  animLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  iconRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  iconChip: { width: "30%", alignItems: "center", padding: 10, borderRadius: 12, borderWidth: 1.5 },
  iconDot: { width: 36, height: 36, borderRadius: 10 },
  iconLabel: { fontSize: 11, marginTop: 6, textAlign: "center" },
});
