import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { searchVidehSounds, type PixabaySound } from "@/lib/pixabaySounds";
import type { SelectedSound } from "@/lib/videoEditor";
import { VIBE_BRAND_NAME } from "@/lib/vibeVideo";

type Props = {
  visible: boolean;
  sessionToken?: string | null;
  selected?: SelectedSound | null;
  onClose: () => void;
  onSelect: (sound: SelectedSound | null) => void;
};

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VibeSoundPicker({ visible, sessionToken, selected, onClose, onSelect }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sounds, setSounds] = useState<PixabaySound[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const previewRef = useRef<Audio.Sound | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = async () => {
    if (previewRef.current) {
      try {
        await previewRef.current.stopAsync();
        await previewRef.current.unloadAsync();
      } catch { /* ignore */ }
      previewRef.current = null;
    }
  };

  const load = async (q: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await searchVidehSounds(q, sessionToken);
      if (!res.success) {
        setSounds([]);
        setMessage(res.message ?? "Could not load sounds.");
        return;
      }
      setSounds(res.sounds);
      if (res.sounds.length === 0) setMessage("No tracks found. Try another search.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      void stopPreview();
      return;
    }
    void load("");
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible]);

  const preview = async (sound: PixabaySound) => {
    if (!sound.audioUrl) return;
    await stopPreview();
    try {
      const { sound: player } = await Audio.Sound.createAsync(
        { uri: sound.audioUrl },
        { shouldPlay: true, volume: 0.9 },
      );
      previewRef.current = player;
    } catch {
      previewRef.current = null;
    }
  };

  const pick = (sound: PixabaySound) => {
    if (!sound.audioUrl) return;
    void stopPreview();
    onSelect({
      id: sound.id,
      title: sound.title,
      artist: sound.artist,
      audioUrl: sound.audioUrl,
      duration: sound.duration,
    });
    onClose();
  };

  useEffect(() => () => { void stopPreview(); }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { void stopPreview(); onClose(); }}>
            <Ionicons name="close" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Sounds</Text>
          <TouchableOpacity
            onPress={() => { void stopPreview(); onSelect(null); onClose(); }}
            disabled={!selected}
          >
            <Text style={{ color: selected ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.search, { backgroundColor: colors.muted }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search royalty-free audio"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Royalty-free audio · Freesound library when API key is configured
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={sounds}
            keyExtractor={(s) => String(s.id)}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            ListEmptyComponent={
              message ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>{message}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => pick(item)}
                onLongPress={() => void preview(item)}
              >
                <View style={[styles.art, { backgroundColor: colors.primary + "22" }]}>
                  <Ionicons name="musical-notes" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trackTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
                    {item.artist} · {formatDur(item.duration)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => void preview(item)} hitSlop={8}>
                  <Ionicons name="play-circle-outline" size={28} color={colors.primary} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  hint: { fontSize: 11, paddingHorizontal: 16, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  art: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  trackTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  empty: { textAlign: "center", padding: 24, fontSize: 14, lineHeight: 20 },
});
