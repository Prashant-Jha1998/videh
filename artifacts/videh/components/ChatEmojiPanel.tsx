import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GifStickerTile } from "@/components/GifStickerTile";
import {
  GIF_QUICK_CATEGORIES,
  fetchTrendingGifs,
  fetchTrendingStickers,
  searchGifs,
  searchStickers,
  type GifMediaItem,
} from "@/lib/chatGifApi";

const EMOJI_SECTIONS: { title: string; emojis: string[] }[] = [
  {
    title: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑"],
  },
  {
    title: "Gestures",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "🤚", "🖐️", "✋", "🖖", "👏", "🙌", "🤝", "🙏", "💪", "🤲", "👊", "✊", "🤛", "🤜", "👆", "👇", "👈", "👉"],
  },
  {
    title: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️"],
  },
  {
    title: "Objects",
    emojis: ["🎉", "🎊", "🔥", "✨", "⭐", "🌟", "💯", "✅", "❌", "⚠️", "📷", "📹", "🎵", "☕", "🍕", "🎂", "⚽", "🏏", "🇮🇳", "🙈", "🙉", "🙊"],
  },
];

type Tab = "emoji" | "gif" | "sticker";

type Props = {
  visible: boolean;
  backgroundColor: string;
  borderColor: string;
  mutedColor: string;
  activeTabColor: string;
  onPickEmoji: (emoji: string) => void;
  onPickGif: (item: GifMediaItem) => void;
  onPickSticker: (item: GifMediaItem) => void;
};

const NUM_COLUMNS = 3;
const PANEL_HEIGHT = 300;
const SCREEN_W = Dimensions.get("window").width;
const CELL_SIZE = Math.floor((SCREEN_W - 12) / NUM_COLUMNS);

export function ChatEmojiPanel({
  visible,
  backgroundColor,
  borderColor,
  mutedColor,
  activeTabColor,
  onPickEmoji,
  onPickGif,
  onPickSticker,
}: Props) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<GifMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<GifMediaItem>>(null);

  const loadMedia = useCallback(async (mode: Tab, query: string, categoryQuery?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const q = (query.trim() || categoryQuery || "").trim();
      let next: GifMediaItem[] = [];
      if (mode === "gif") {
        next = q ? await searchGifs(q) : await fetchTrendingGifs();
      } else if (mode === "sticker") {
        next = q ? await searchStickers(q) : await fetchTrendingStickers();
      }
      setItems(next);
      if (next.length === 0) setLoadError("No GIFs found. Check connection or try again.");
    } catch {
      setItems([]);
      setLoadError("Could not load GIFs. Pull to refresh or try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (tab === "emoji") return;
    void loadMedia(tab, search);
  }, [visible, tab]);

  useEffect(() => {
    if (!visible || tab === "emoji") return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadMedia(tab, search);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, tab, visible, loadMedia]);

  const onCategory = (query: string) => {
    setSearch("");
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    void loadMedia("gif", "", query);
  };

  const onPickMedia = useCallback(
    (item: GifMediaItem) => {
      if (tab === "gif") onPickGif(item);
      else onPickSticker(item);
    },
    [tab, onPickGif, onPickSticker],
  );

  const renderMediaCell = useCallback(
    ({ item }: { item: GifMediaItem }) => (
      <GifStickerTile item={item} size={CELL_SIZE} onPress={() => onPickMedia(item)} />
    ),
    [onPickMedia],
  );

  const listKey = useMemo(() => `${tab}-${search}`, [tab, search]);

  if (!visible) return null;

  return (
    <View style={[styles.panel, { backgroundColor, borderTopColor: borderColor, height: PANEL_HEIGHT }]}>
      <View style={[styles.topBar, { borderBottomColor: borderColor }]}>
        <Ionicons name="search" size={20} color={mutedColor} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: activeTabColor }]}
          placeholder={tab === "sticker" ? "Search stickers" : tab === "gif" ? "Search GIFs" : "Search emoji"}
          placeholderTextColor={mutedColor}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (tab === "emoji" && search.trim()) {
              const match = EMOJI_SECTIONS.flatMap((s) => s.emojis).find((e) => e.includes(search.trim()));
              if (match) onPickEmoji(match);
            } else if (tab !== "emoji") {
              void loadMedia(tab, search);
            }
          }}
        />
        <TouchableOpacity
          style={[styles.tabBtn, tab === "emoji" && styles.tabBtnActive]}
          onPress={() => { setTab("emoji"); setSearch(""); }}
        >
          <Ionicons name="happy-outline" size={22} color={tab === "emoji" ? activeTabColor : mutedColor} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "gif" && styles.tabBtnActive]}
          onPress={() => { setTab("gif"); setSearch(""); }}
        >
          <Text style={[styles.gifTabLabel, { color: tab === "gif" ? activeTabColor : mutedColor }]}>GIF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "sticker" && styles.tabBtnActive]}
          onPress={() => { setTab("sticker"); setSearch(""); }}
        >
          <View style={[styles.stickerTabIcon, { borderColor: tab === "sticker" ? activeTabColor : mutedColor }]}>
            <View style={[styles.stickerTabFold, { backgroundColor: tab === "sticker" ? activeTabColor : mutedColor }]} />
          </View>
        </TouchableOpacity>
      </View>

      {tab === "emoji" ? (
        <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} style={styles.flex}>
          {EMOJI_SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: mutedColor }]}>{section.title}</Text>
              <View style={styles.grid}>
                {section.emojis.map((emoji) => (
                  <TouchableOpacity key={emoji} style={styles.cell} onPress={() => onPickEmoji(emoji)} activeOpacity={0.55}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <>
          {tab === "gif" && !search.trim() && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={styles.categoryContent}>
              {GIF_QUICK_CATEGORIES.map((c) => (
                <TouchableOpacity key={c.label} style={[styles.categoryChip, { borderColor }]} onPress={() => onCategory(c.query)}>
                  <Text style={styles.categoryEmoji}>{c.emoji}</Text>
                  <Text style={[styles.categoryLabel, { color: mutedColor }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={activeTabColor} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              key={listKey}
              data={items}
              keyExtractor={(it) => it.id}
              numColumns={NUM_COLUMNS}
              renderItem={renderMediaCell}
              style={styles.flex}
              contentContainerStyle={styles.mediaList}
              keyboardShouldPersistTaps="always"
              removeClippedSubviews={false}
              initialNumToRender={12}
              maxToRenderPerBatch={15}
              windowSize={7}
              getItemLayout={(_, index) => ({
                length: CELL_SIZE,
                offset: CELL_SIZE * Math.floor(index / NUM_COLUMNS),
                index,
              })}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: mutedColor }]}>
                  {loadError ?? "No results"}
                </Text>
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchIcon: { marginRight: 4 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  tabBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 4 },
  tabBtnActive: { backgroundColor: "rgba(0,0,0,0.06)" },
  gifTabLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  stickerTabIcon: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 4,
    overflow: "hidden",
  },
  stickerTabFold: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    transform: [{ rotate: "45deg" }],
  },
  section: { paddingHorizontal: 8, paddingTop: 8 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4, marginLeft: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "12.5%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 26 },
  categoryRow: { maxHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  categoryContent: { paddingHorizontal: 8, paddingVertical: 6, gap: 8, alignItems: "center" },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  categoryEmoji: { fontSize: 14, marginRight: 4 },
  categoryLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  mediaList: { paddingHorizontal: 4, paddingBottom: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { textAlign: "center", marginTop: 24, fontFamily: "Inter_400Regular", paddingHorizontal: 16 },
});
