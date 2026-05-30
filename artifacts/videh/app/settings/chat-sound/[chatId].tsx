import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { applyVidehNotificationSounds } from "@/lib/applyNotificationChannels";
import {
  CONTACT_SOUND_PRESETS,
  labelForSoundId,
  MESSAGE_SOUNDS,
  type ContactSoundPresetId,
  type MessageSoundId,
} from "@/lib/premiumSounds";
import { previewSoundAsset } from "@/lib/soundPreview";
import { getSoundPrefs, setChatCustomMessageSound, setChatSoundPreset, type SoundPrefs } from "@/lib/soundPrefs";

export default function ChatSoundScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name?: string }>();
  const [prefs, setPrefs] = useState<SoundPrefs | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const title = name?.trim() || "Chat";

  const reload = useCallback(async () => {
    if (!chatId) return;
    setPrefs(await getSoundPrefs());
  }, [chatId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const currentPreset = chatId && prefs ? prefs.chatPresets[chatId] ?? "default" : "default";
  const currentCustom = chatId && prefs ? prefs.chatMessageSounds[chatId] : undefined;

  const applyPreset = async (presetId: ContactSoundPresetId) => {
    if (!chatId) return;
    const preset = CONTACT_SOUND_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = await setChatSoundPreset(chatId, presetId, preset.messageSoundId);
    setPrefs(next);
    await applyVidehNotificationSounds();
    if (presetId !== "default") void previewSoundAsset(preset.messageSoundId);
  };

  const applyCustom = async (soundId: MessageSoundId) => {
    if (!chatId) return;
    const next = await setChatCustomMessageSound(chatId, soundId);
    setPrefs(next);
    await applyVidehNotificationSounds();
    void previewSoundAsset(soundId);
  };

  const summary =
    currentCustom && currentCustom !== "msg_default"
      ? labelForSoundId(currentCustom)
      : currentPreset !== "default"
        ? CONTACT_SOUND_PRESETS.find((p) => p.id === currentPreset)?.label ?? "Custom"
        : "Global default";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Notification sound
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.hero, { backgroundColor: colors.card }]}>
        <Text style={[styles.chatName, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.current, { color: colors.mutedForeground }]}>Current: {summary}</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Know who messaged without looking — romantic for partner, professional for boss, family for groups.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 12 }}>
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Quick presets</Text>
          {CONTACT_SOUND_PRESETS.map((preset, idx) => {
            const selected = currentPreset === preset.id && !currentCustom;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[styles.presetRow, idx < CONTACT_SOUND_PRESETS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 0.5 }]}
                onPress={() => void applyPreset(preset.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.presetIcon, { backgroundColor: preset.color + "22" }]}>
                  <Ionicons name={preset.icon as keyof typeof Ionicons.glyphMap} size={20} color={preset.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.presetLabel, { color: colors.foreground }]}>{preset.label}</Text>
                  <Text style={[styles.presetHint, { color: colors.mutedForeground }]}>{preset.hint}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.customToggle, { backgroundColor: colors.card }]}
          onPress={() => setShowCustom((v) => !v)}
        >
          <Text style={[styles.customToggleText, { color: colors.foreground }]}>Choose exact tone</Text>
          <Ionicons name={showCustom ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        {showCustom && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            {MESSAGE_SOUNDS.map((entry, idx) => (
              <TouchableOpacity
                key={entry.id}
                style={[styles.presetRow, idx < MESSAGE_SOUNDS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 0.5 }]}
                onPress={() => void applyCustom(entry.id as MessageSoundId)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetLabel, { color: colors.foreground }]}>{entry.label}</Text>
                {currentCustom === entry.id ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  hero: { margin: 12, padding: 16, borderRadius: 12 },
  chatName: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  current: { fontSize: 13, marginTop: 4, fontFamily: "Inter_500Medium" },
  hint: { fontSize: 12, marginTop: 10, lineHeight: 17, fontFamily: "Inter_400Regular" },
  section: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  presetRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  presetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  presetLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  presetHint: { fontSize: 12, marginTop: 2, fontFamily: "Inter_400Regular" },
  customToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 12, marginBottom: 10 },
  customToggleText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
