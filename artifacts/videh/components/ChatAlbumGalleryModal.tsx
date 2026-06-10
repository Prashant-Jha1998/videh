import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { authFetchHeaders } from "@/lib/authenticatedMedia";

const { width: SCREEN_W } = Dimensions.get("window");

function galleryImageSource(uri: string, sessionToken?: string | null) {
  if (uri.includes("/api/chats/media/") && sessionToken) {
    return { uri, headers: authFetchHeaders(sessionToken) as Record<string, string> };
  }
  return { uri };
}

type Props = {
  visible: boolean;
  urls: string[];
  initialIndex: number;
  sessionToken?: string | null;
  caption?: string;
  onClose: () => void;
  onSave?: (uri: string) => void;
};

export function ChatAlbumGalleryModal({
  visible,
  urls,
  initialIndex,
  sessionToken,
  caption,
  onClose,
  onSave,
}: Props) {
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(initialIndex);
  const list = urls.filter(Boolean);

  useEffect(() => {
    if (!visible) return;
    const safeIndex = Math.min(Math.max(initialIndex, 0), Math.max(list.length - 1, 0));
    setIndex(safeIndex);
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: safeIndex, animated: false });
    }, 40);
    return () => clearTimeout(timer);
  }, [visible, initialIndex, list.length]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setIndex(Math.min(Math.max(next, 0), list.length - 1));
  };

  if (list.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.counter}>
            {index + 1} / {list.length}
          </Text>
          {onSave ? (
            <TouchableOpacity style={styles.saveBtn} onPress={() => onSave(list[index])}>
              <Ionicons name="download-outline" size={20} color="#fff" />
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        <FlatList
          ref={listRef}
          data={list}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(initialIndex, list.length - 1)}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={onScrollEnd}
          keyExtractor={(uri, i) => `${uri}_${i}`}
          renderItem={({ item }) => (
            <View style={styles.page}>
              <Image
                source={galleryImageSource(item, sessionToken)}
                style={styles.image}
                contentFit="contain"
              />
            </View>
          )}
        />

        {caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.caption}>{caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "rgba(0,0,0,0.98)" },
  header: {
    paddingTop: 46,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerBtn: { width: 40, padding: 8 },
  counter: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  saveText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  page: { width: SCREEN_W, flex: 1, justifyContent: "center" },
  image: { width: SCREEN_W, flex: 1 },
  captionWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  caption: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular" },
});
