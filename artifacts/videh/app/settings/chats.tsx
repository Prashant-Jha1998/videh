import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const WALLPAPERS = ["Default", "Dark", "Classic Dark", "Light Blue", "Solid Black", "Solid White"];
const FONT_SIZES = ["Small", "Medium", "Large", "Extra Large"];
const THEMES = ["System default", "Light", "Dark"];
const BACKUP_OPTIONS = ["Never", "Daily", "Weekly", "Monthly"];

export default function ChatsSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [enterSend, setEnterSend] = useState(false);
  const [mediaVisibility, setMediaVisibility] = useState(true);
  const [fontSize, setFontSize] = useState("Medium");
  const [theme, setTheme] = useState("System default");
  const [wallpaper, setWallpaper] = useState("Default");
  const [backup, setBackup] = useState("Weekly");
  const [emojiVariant, setEmojiVariant] = useState(true);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        {/* Display */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Display</Text>
          <TappableRow
            label="Theme"
            value={theme}
            onPress={() => Alert.alert("Theme", "", THEMES.map((t) => ({ text: t, onPress: () => setTheme(t) })))}
            colors={colors}
          />
          <TappableRow
            label="Wallpaper"
            value={wallpaper}
            onPress={() => Alert.alert("Wallpaper", "", WALLPAPERS.map((w) => ({ text: w, onPress: () => setWallpaper(w) })))}
            colors={colors}
          />
          <TappableRow
            label="Font size"
            value={fontSize}
            onPress={() => Alert.alert("Font Size", "", FONT_SIZES.map((f) => ({ text: f, onPress: () => setFontSize(f) })))}
            colors={colors}
            last
          />
        </View>

        {/* Chat settings */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Chat settings</Text>
          <SwitchRow
            label="Enter is send"
            hint="Press Enter key to send a message"
            value={enterSend}
            onChange={setEnterSend}
            colors={colors}
          />
          <SwitchRow
            label="Media visibility"
            hint="Show newly downloaded media in your device's gallery"
            value={mediaVisibility}
            onChange={setMediaVisibility}
            colors={colors}
          />
          <SwitchRow
            label="Emoji variant panel"
            value={emojiVariant}
            onChange={setEmojiVariant}
            colors={colors}
            last
          />
        </View>

        {/* Backup */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Chat backup</Text>
          <TappableRow
            label="Back up to local storage"
            value={backup}
            onPress={() => Alert.alert("Backup frequency", "", BACKUP_OPTIONS.map((b) => ({ text: b, onPress: () => setBackup(b) })))}
            colors={colors}
          />
          <TouchableOpacity
            style={styles.backupBtn}
            onPress={() => Alert.alert("Backup Now", "Your chats have been backed up successfully.")}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            <Text style={[styles.backupBtnText, { color: colors.primary }]}>Back up now</Text>
          </TouchableOpacity>
        </View>

        {/* Chat history */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Chat history</Text>
          <TouchableOpacity
            style={styles.historyRow}
            onPress={() => Alert.alert("Export chats", "Chat export to email/file will be available soon.")}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={18} color={colors.foreground} />
            <Text style={[styles.historyLabel, { color: colors.foreground }]}>Export chat</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]}
            onPress={() => Alert.alert("Clear all chats", "This will permanently delete all message history.", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", style: "destructive", onPress: () => Alert.alert("Cleared", "All chats cleared.") },
            ])}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
            <Text style={[styles.historyLabel, { color: colors.destructive }]}>Clear all chats</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SwitchRow({ label, hint, value, onChange, colors, last }: any) {
  return (
    <View style={[styles.switchRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {hint && <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} thumbColor={value ? colors.primary : "#f4f3f4"} trackColor={{ true: colors.primary + "80" }} />
    </View>
  );
}

function TappableRow({ label, value, onPress, colors, last }: any) {
  return (
    <TouchableOpacity
      style={[styles.tappableRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  switchRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  tappableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  backupBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 0.5 },
  backupBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  historyLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
