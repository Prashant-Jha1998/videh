import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
  CALL_RINGTONES,
  labelForSoundId,
  MESSAGE_SOUNDS,
  SOUND_PACKS,
  type CallSoundId,
  type MessageSoundId,
  type SoundPackId,
} from "@/lib/premiumSounds";
import { previewSoundAsset } from "@/lib/soundPreview";
import { getSoundPrefs, patchSoundPrefs, type SoundPrefs } from "@/lib/soundPrefs";
import { setCallRingtonePref } from "@/lib/callAudioPrefs";

type Tab = "packs" | "messages" | "calls";

export default function PremiumSoundsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [prefs, setPrefs] = useState<SoundPrefs | null>(null);
  const [tab, setTab] = useState<Tab>("packs");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const reload = useCallback(async () => {
    setPrefs(await getSoundPrefs());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const enabledSet = useMemo(() => new Set(prefs?.enabledPacks ?? []), [prefs?.enabledPacks]);

  const visibleMessageSounds = useMemo(() => {
    return MESSAGE_SOUNDS.filter((s) => {
      if (!s.pack) return true;
      return enabledSet.has(s.pack);
    });
  }, [enabledSet]);

  const togglePack = async (packId: SoundPackId) => {
    if (!prefs) return;
    const packs = [...prefs.enabledPacks];
    const i = packs.indexOf(packId);
    if (i >= 0) {
      if (packs.length <= 1) return;
      packs.splice(i, 1);
    } else {
      packs.push(packId);
    }
    const next = await patchSoundPrefs({ enabledPacks: packs });
    setPrefs(next);
    await applyVidehNotificationSounds();
  };

  const setMessage = async (id: MessageSoundId, group: boolean) => {
    const patch = group ? { globalGroupMessageSound: id } : { globalMessageSound: id };
    const next = await patchSoundPrefs(patch);
    setPrefs(next);
    await applyVidehNotificationSounds();
    void previewSoundAsset(id);
  };

  const setCall = async (id: CallSoundId) => {
    await setCallRingtonePref(id);
    const next = await getSoundPrefs();
    setPrefs(next);
    if (id !== "none") void previewSoundAsset(id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium sounds</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="musical-notes" size={28} color={colors.primary} />
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>
          Ringtones, VIP tones & per-chat sounds
        </Text>
        <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
          Pick call ringtones, message alerts, and sound packs. Set a unique tone per contact or group from chat info.
        </Text>
      </View>

      <View style={styles.tabs}>
        {(["packs", "messages", "calls"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "packs" ? "Packs" : t === "messages" ? "Messages" : "Calls"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48, paddingHorizontal: 12 }}>
        {tab === "packs" && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>Sound packs</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Enable packs to unlock their tones in message settings.
            </Text>
            {SOUND_PACKS.map((pack) => {
              const on = enabledSet.has(pack.id);
              return (
                <TouchableOpacity
                  key={pack.id}
                  style={[styles.packRow, { borderBottomColor: colors.border }]}
                  onPress={() => void togglePack(pack.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.packIcon, { backgroundColor: pack.color + "22" }]}>
                    <Ionicons name={pack.icon as keyof typeof Ionicons.glyphMap} size={22} color={pack.color} />
                  </View>
                  <View style={styles.packText}>
                    <Text style={[styles.packName, { color: colors.foreground }]}>{pack.name}</Text>
                    <Text style={[styles.packDesc, { color: colors.mutedForeground }]}>{pack.description}</Text>
                  </View>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={on ? colors.primary : colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {tab === "messages" && prefs && (
          <>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>Chats</Text>
              {visibleMessageSounds.map((entry, idx) => (
                <SoundRow
                  key={entry.id}
                  label={entry.label}
                  subtitle={entry.subtitle}
                  selected={prefs.globalMessageSound === entry.id}
                  last={idx === visibleMessageSounds.length - 1}
                  colors={colors}
                  onPress={() => void setMessage(entry.id as MessageSoundId, false)}
                />
              ))}
            </View>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>Groups</Text>
              {visibleMessageSounds.map((entry, idx) => (
                <SoundRow
                  key={`g-${entry.id}`}
                  label={entry.label}
                  selected={prefs.globalGroupMessageSound === entry.id}
                  last={idx === visibleMessageSounds.length - 1}
                  colors={colors}
                  onPress={() => void setMessage(entry.id as MessageSoundId, true)}
                />
              ))}
            </View>
            <Text style={[styles.footerHint, { color: colors.mutedForeground }]}>
              Wife, boss, family — open any chat → Chat info → Custom notification sound.
            </Text>
          </>
        )}

        {tab === "calls" && prefs && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>Call ringtone</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Plays on incoming Videh calls (in-app + notification).
            </Text>
            {CALL_RINGTONES.map((entry, idx) => (
              <SoundRow
                key={entry.id}
                label={entry.label}
                subtitle={entry.pack ? `${entry.pack} pack` : undefined}
                selected={prefs.globalCallSound === entry.id}
                last={idx === CALL_RINGTONES.length - 1}
                colors={colors}
                onPress={() => void setCall(entry.id as CallSoundId)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SoundRow({
  label,
  subtitle,
  selected,
  last,
  colors,
  onPress,
}: {
  label: string;
  subtitle?: string;
  selected: boolean;
  last?: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.soundRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.soundLabel, { color: colors.foreground }]}>{label}</Text>
        {subtitle ? <Text style={[styles.soundSub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  hero: { margin: 12, padding: 16, borderRadius: 12, borderWidth: 0.5, gap: 8 },
  heroTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  tabs: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  section: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },
  packRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 0.5, gap: 12 },
  packIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  packText: { flex: 1 },
  packName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  packDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  soundRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  soundLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  soundSub: { fontSize: 12, marginTop: 2 },
  footerHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 8, lineHeight: 18 },
});
