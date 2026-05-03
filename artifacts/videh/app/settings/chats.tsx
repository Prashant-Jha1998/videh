import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useUiPreferences } from "@/context/UiPreferencesContext";
import {
  CHAT_STORAGE,
  choiceToThemeLabel,
  loadOptionalBool,
  loadOptionalString,
  saveOptionalBool,
  saveOptionalString,
  themeLabelToChoice,
} from "@/lib/chatSettings";

const WALLPAPERS = ["Default", "Dark", "Classic Dark", "Light Blue", "Solid Black", "Solid White"];
const FONT_SIZES = ["Small", "Medium", "Large", "Extra Large"];
const THEMES = ["System default", "Light", "Dark"] as const;
const BACKUP_OPTIONS = ["Never", "Daily", "Weekly", "Monthly"];

export default function ChatsSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, chatThemeChoice, setChatThemeChoice } = useUiPreferences();

  const [enterSend, setEnterSend] = useState(false);
  const [mediaVisibility, setMediaVisibility] = useState(true);
  const [fontSize, setFontSize] = useState("Medium");
  const [themeLabel, setThemeLabel] = useState<(typeof THEMES)[number]>("System default");
  const [wallpaper, setWallpaper] = useState("Default");
  const [backup, setBackup] = useState("Weekly");
  const [emojiVariant, setEmojiVariant] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  useEffect(() => {
    setThemeLabel(choiceToThemeLabel(chatThemeChoice));
  }, [chatThemeChoice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, f, b, enter, media, emoji] = await Promise.all([
          loadOptionalString(CHAT_STORAGE.wallpaper, "Default"),
          loadOptionalString(CHAT_STORAGE.fontSize, "Medium"),
          loadOptionalString(CHAT_STORAGE.backup, "Weekly"),
          loadOptionalBool(CHAT_STORAGE.enterIsSend, false),
          loadOptionalBool(CHAT_STORAGE.mediaVisibility, true),
          loadOptionalBool(CHAT_STORAGE.emojiVariant, true),
        ]);
        if (cancelled) return;
        setWallpaper(w);
        setFontSize(f);
        setBackup(b);
        setEnterSend(enter);
        setMediaVisibility(media);
        setEmojiVariant(emoji);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistEnter = useCallback(async (v: boolean) => {
    setEnterSend(v);
    await saveOptionalBool(CHAT_STORAGE.enterIsSend, v);
  }, []);

  const persistMedia = useCallback(async (v: boolean) => {
    setMediaVisibility(v);
    await saveOptionalBool(CHAT_STORAGE.mediaVisibility, v);
  }, []);

  const persistEmoji = useCallback(async (v: boolean) => {
    setEmojiVariant(v);
    await saveOptionalBool(CHAT_STORAGE.emojiVariant, v);
  }, []);

  const pickTheme = (label: string) => {
    const choice = themeLabelToChoice(label);
    void setChatThemeChoice(choice);
    setThemeLabel(choiceToThemeLabel(choice));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("chats.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        {/* Display */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>{t("chats.sectionDisplay")}</Text>
          <TappableRow
            label={t("chats.theme")}
            value={themeLabel}
            onPress={() =>
              Alert.alert(t("chats.theme"), "", [
                ...THEMES.map((x) => ({ text: x, onPress: () => pickTheme(x) })),
                { text: t("common.cancel"), style: "cancel" },
              ])
            }
            colors={colors}
          />
          <TappableRow
            label={t("chats.wallpaper")}
            value={wallpaper}
            onPress={() =>
              Alert.alert(t("chats.wallpaper"), "", [
                ...WALLPAPERS.map((w) => ({
                  text: w,
                  onPress: () => {
                    setWallpaper(w);
                    void saveOptionalString(CHAT_STORAGE.wallpaper, w);
                  },
                })),
                { text: t("common.cancel"), style: "cancel" },
              ])
            }
            colors={colors}
          />
          <TappableRow
            label={t("chats.fontSize")}
            value={fontSize}
            onPress={() =>
              Alert.alert(t("chats.fontSize"), "", [
                ...FONT_SIZES.map((f) => ({
                  text: f,
                  onPress: () => {
                    setFontSize(f);
                    void saveOptionalString(CHAT_STORAGE.fontSize, f);
                  },
                })),
                { text: t("common.cancel"), style: "cancel" },
              ])
            }
            colors={colors}
            last
          />
        </View>

        {/* Chat settings */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>{t("chats.sectionChat")}</Text>
          <SwitchRow
            label={t("chats.enterSend")}
            hint={t("chats.enterSendHint")}
            value={enterSend}
            onChange={persistEnter}
            colors={colors}
            disabled={!hydrated}
          />
          <SwitchRow
            label={t("chats.mediaVis")}
            hint={t("chats.mediaVisHint")}
            value={mediaVisibility}
            onChange={persistMedia}
            colors={colors}
            disabled={!hydrated}
          />
          <SwitchRow
            label={t("chats.emojiPanel")}
            value={emojiVariant}
            onChange={persistEmoji}
            colors={colors}
            last
            disabled={!hydrated}
          />
        </View>

        {/* Backup */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>{t("chats.sectionBackup")}</Text>
          <TappableRow
            label={t("chats.backupLocal")}
            value={backup}
            onPress={() =>
              Alert.alert(t("chats.backupLocal"), "", [
                ...BACKUP_OPTIONS.map((b) => ({
                  text: b,
                  onPress: () => {
                    setBackup(b);
                    void saveOptionalString(CHAT_STORAGE.backup, b);
                  },
                })),
                { text: t("common.cancel"), style: "cancel" },
              ])
            }
            colors={colors}
          />
          <TouchableOpacity
            style={styles.backupBtn}
            onPress={() => Alert.alert(t("chats.backupNow"), t("common.ok"))}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            <Text style={[styles.backupBtnText, { color: colors.primary }]}>{t("chats.backupNow")}</Text>
          </TouchableOpacity>
        </View>

        {/* Chat history */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>{t("chats.sectionHistory")}</Text>
          <TouchableOpacity
            style={styles.historyRow}
            onPress={() => Alert.alert(t("chats.export"), "Chat export to email/file will be available soon.")}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={18} color={colors.foreground} />
            <Text style={[styles.historyLabel, { color: colors.foreground }]}>{t("chats.export")}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]}
            onPress={() =>
              Alert.alert(t("chats.clearAll"), "This will permanently delete all message history.", [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("chats.clearAll"),
                  style: "destructive",
                  onPress: () => Alert.alert(t("common.ok"), "All chats cleared."),
                },
              ])
            }
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={colors.destructive} />
            <Text style={[styles.historyLabel, { color: colors.destructive }]}>{t("chats.clearAll")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  colors,
  last,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.switchRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        thumbColor={value ? colors.primary : "#f4f3f4"}
        trackColor={{ true: colors.primary + "80" }}
      />
    </View>
  );
}

function TappableRow({
  label,
  value,
  onPress,
  colors,
  last,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
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
