import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const FONT_SIZES = [
  { key: "small", label: "Small", size: 13, preview: "Aa" },
  { key: "medium", label: "Normal", size: 16, preview: "Aa" },
  { key: "large", label: "Large", size: 19, preview: "Aa" },
  { key: "xlarge", label: "Extra large", size: 22, preview: "Aa" },
];

export default function AccessibilityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [fontSize, setFontSize] = useState("medium");
  const [highContrast, setHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [boldText, setBoldText] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(["fontSize", "highContrast", "reduceMotion", "boldText"]).then((vals) => {
      const map = Object.fromEntries(vals.map(([k, v]) => [k, v]));
      if (map.fontSize) setFontSize(map.fontSize);
      if (map.highContrast) setHighContrast(map.highContrast === "true");
      if (map.reduceMotion) setReduceMotion(map.reduceMotion === "true");
      if (map.boldText) setBoldText(map.boldText === "true");
    });
  }, []);

  const save = (key: string, value: string) => AsyncStorage.setItem(key, value);

  const selectFontSize = (key: string) => {
    setFontSize(key);
    save("fontSize", key);
  };

  const previewSize = FONT_SIZES.find((f) => f.key === fontSize)?.size ?? 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Accessibility</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        {/* Font Size */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>FONT SIZE</Text>
          <View style={styles.fontRow}>
            {FONT_SIZES.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.fontOption,
                  { borderColor: fontSize === f.key ? colors.primary : colors.border, backgroundColor: fontSize === f.key ? colors.primary + "15" : colors.background }
                ]}
                onPress={() => selectFontSize(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.fontPreview, { fontSize: f.size, color: colors.foreground }]}>{f.preview}</Text>
                <Text style={[styles.fontLabel, { color: fontSize === f.key ? colors.primary : colors.mutedForeground }]}>{f.label}</Text>
                {fontSize === f.key && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Message preview */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>PREVIEW</Text>
          <View style={[styles.previewBubble, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.previewText, { fontSize: previewSize, color: colors.foreground }]}>
              Hi! How is your day going? 😊
            </Text>
            <Text style={[styles.previewTime, { color: colors.mutedForeground }]}>10:30 AM ✓✓</Text>
          </View>
        </View>

        {/* Other options */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>DISPLAY</Text>
          <ToggleRow
            icon="contrast-outline" iconBg="#1a1a2e"
            label="High Contrast Mode"
            hint="Text and background will look more distinct"
            enabled={highContrast}
            onToggle={() => { setHighContrast(v => !v); save("highContrast", String(!highContrast)); }}
            colors={colors}
          />
          <ToggleRow
            icon="text-outline" iconBg="#3F51B5"
            label="Bold Text"
            hint="All text will appear bold"
            enabled={boldText}
            onToggle={() => { setBoldText(v => !v); save("boldText", String(!boldText)); }}
            colors={colors}
          />
          <ToggleRow
            icon="speedometer-outline" iconBg="#FF5722"
            label="Reduce Motion"
            hint="Reduce animated effects in the app"
            enabled={reduceMotion}
            onToggle={() => { setReduceMotion(v => !v); save("reduceMotion", String(!reduceMotion)); }}
            colors={colors}
            last
          />
        </View>
      </ScrollView>
    </View>
  );
}

function ToggleRow({ icon, iconBg, label, hint, enabled, onToggle, colors, last }: any) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text>
      </View>
      <View style={[styles.toggle, { backgroundColor: enabled ? colors.primary : colors.muted }]}>
        <View style={[styles.toggleKnob, { transform: [{ translateX: enabled ? 18 : 0 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 8 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12, paddingTop: 4 },
  fontRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  fontOption: { flex: 1, alignItems: "center", gap: 4, padding: 10, borderRadius: 12, borderWidth: 2 },
  fontPreview: { fontFamily: "Inter_700Bold" },
  fontLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  previewBubble: { borderRadius: 14, padding: 14, gap: 4 },
  previewText: { fontFamily: "Inter_400Regular", lineHeight: 22 },
  previewTime: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center", padding: 2 },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
});
