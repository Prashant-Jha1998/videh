import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { ThemedHeader } from "@/components/ThemedHeader";
import { useColors } from "@/hooks/useColors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { APP_THEME_OPTIONS } from "@/lib/appThemes";
import {
  ANIMATED_WALLPAPERS,
  getThemeAppearanceById,
  type AnimatedWallpaperId,
} from "@/lib/themeAppearance";
import { getPerChatTheme, setPerChatTheme } from "@/lib/perChatTheme";

const BUBBLE_PRESETS = [
  { name: "Pink", sent: "#FCE7F3", received: "#FFFFFF" },
  { name: "Blue", sent: "#DBEAFE", received: "#FFFFFF" },
  { name: "Purple", sent: "#EDE9FE", received: "#FFFFFF" },
  { name: "Grey", sent: "#E5E7EB", received: "#FFFFFF" },
];

export default function ChatThemeScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { appThemeId, refreshPerChatThemes } = useUiPreferences();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [themeId, setThemeId] = useState(appThemeId);
  const [bubbleSent, setBubbleSent] = useState<string | undefined>();
  const [bubbleReceived, setBubbleReceived] = useState<string | undefined>();
  const [animated, setAnimated] = useState<AnimatedWallpaperId>("none");

  useEffect(() => {
    if (!chatId) return;
    void getPerChatTheme(chatId).then((o) => {
      if (!o) return;
      if (o.themeId) setThemeId(o.themeId);
      if (o.bubbleSent) setBubbleSent(o.bubbleSent);
      if (o.bubbleReceived) setBubbleReceived(o.bubbleReceived);
      if (o.animatedWallpaper) setAnimated(o.animatedWallpaper);
    });
  }, [chatId]);

  const appearance = getThemeAppearanceById(themeId);

  const save = async () => {
    if (!chatId) return;
    await setPerChatTheme(chatId, {
      themeId: themeId !== appThemeId ? themeId : undefined,
      bubbleSent,
      bubbleReceived,
      animatedWallpaper: animated !== "none" ? animated : undefined,
      label: appearance.name,
    });
    refreshPerChatThemes();
    Alert.alert("Saved", `Theme for ${name ?? "this chat"} updated.`);
    router.back();
  };

  const clear = async () => {
    if (!chatId) return;
    await setPerChatTheme(chatId, null);
    refreshPerChatThemes();
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ThemedHeader style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Chat theme</Text>
        <TouchableOpacity onPress={() => void save()} style={styles.saveBtn}>
          <Text style={styles.saveTxt}>Save</Text>
        </TouchableOpacity>
      </ThemedHeader>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={[styles.chatName, { color: colors.foreground }]}>{name ?? "Chat"}</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Girlfriend = Pink, Family = Blue, Office = Grey — set a unique look for this chat only.
        </Text>

        <Text style={[styles.label, { color: colors.primary }]}>Accent theme</Text>
        <View style={styles.grid}>
          {APP_THEME_OPTIONS.slice(0, 18).map((t) => {
            const selected = t.id === themeId;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setThemeId(t.id)}
                style={[styles.card, { borderColor: selected ? colors.primary : colors.border }]}
              >
                <LinearGradient colors={t.colors} style={styles.swatch} />
                <Text style={[styles.cardTxt, { color: colors.foreground }]} numberOfLines={1}>{t.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.primary }]}>Bubble colors</Text>
        <View style={styles.row}>
          {BUBBLE_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.name}
              style={[styles.preset, { borderColor: colors.border }]}
              onPress={() => {
                setBubbleSent(p.sent);
                setBubbleReceived(p.received);
              }}
            >
              <Text style={{ color: colors.foreground, fontSize: 12 }}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.primary }]}>Animated background</Text>
        <View style={styles.row}>
          {ANIMATED_WALLPAPERS.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.preset, { borderColor: animated === w.id ? colors.primary : colors.border }]}
              onPress={() => setAnimated(w.id)}
            >
              <Text style={{ color: colors.foreground, fontSize: 12 }}>{w.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={() => void clear()} style={[styles.clearBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold" }}>Reset to global theme</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  saveBtn: { padding: 8 },
  saveTxt: { color: "#fff", fontFamily: "Inter_700Bold" },
  chatName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  label: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 12, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "30%", borderWidth: 1.5, borderRadius: 10, padding: 6, alignItems: "center" },
  swatch: { width: "100%", aspectRatio: 1, borderRadius: 8 },
  cardTxt: { fontSize: 10, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  clearBtn: { marginTop: 24, padding: 14, borderRadius: 10, borderWidth: 1, alignItems: "center" },
});
