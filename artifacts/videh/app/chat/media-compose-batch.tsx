import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { takeBatchMedia } from "@/lib/chatMediaBatch";
import { isGifUri, type MediaQuality } from "@/lib/imageEdit";

export default function ChatMediaComposeBatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sendAlbumMessage, sendPreparedMediaMessage } = useApp();
  const [chatId, setChatId] = useState("");
  const [uris, setUris] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [quality, setQuality] = useState<MediaQuality>("standard");

  useEffect(() => {
    void (async () => {
      const batch = await takeBatchMedia();
      if (!batch || batch.items.length === 0) {
        router.back();
        return;
      }
      setChatId(batch.chatId);
      setUris(batch.items.filter((i) => i.kind === "image").map((i) => i.uri));
    })();
  }, [router]);

  function onSend() {
    if (!chatId || uris.length === 0) return;
    const cap = caption.trim();
    if (uris.length === 1) {
      sendPreparedMediaMessage(chatId, {
        localUri: uris[0],
        kind: "image",
        caption: cap,
        quality,
        isViewOnce: false,
      });
    } else {
      sendAlbumMessage(chatId, { localUris: uris, caption: cap, quality });
    }
    router.back();
  }

  if (!chatId || uris.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#5B4FE8" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{uris.length} photos</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.qualityRow}>
        <TouchableOpacity
          style={[styles.qualityBtn, quality === "standard" && styles.qualityBtnActive]}
          onPress={() => setQuality("standard")}
        >
          <Text style={[styles.qualityText, quality === "standard" && styles.qualityTextActive]}>Standard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.qualityBtn, quality === "hd" && styles.qualityBtnActive]}
          onPress={() => setQuality("hd")}
        >
          <Text style={[styles.qualityText, quality === "hd" && styles.qualityTextActive]}>HD</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={uris}
        keyExtractor={(item, idx) => `${item}_${idx}`}
        numColumns={3}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <View style={styles.thumbWrap}>
            <Image source={{ uri: item }} style={styles.thumb} contentFit="cover" />
            {isGifUri(item) ? (
              <View style={styles.gifBadge}><Text style={styles.gifText}>GIF</Text></View>
            ) : null}
          </View>
        )}
      />

      <TextInput
        style={styles.caption}
        placeholder="Add a caption…"
        placeholderTextColor="#8696a0"
        value={caption}
        onChangeText={setCaption}
        multiline
      />

      <TouchableOpacity style={styles.sendBtn} onPress={onSend}>
        <Ionicons name="send" size={22} color="#fff" />
        <Text style={styles.sendText}>Send {uris.length} photos</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12101F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#12101F" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 8 },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  qualityRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  qualityBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#202c33", alignItems: "center" },
  qualityBtnActive: { backgroundColor: "#5B4FE8" },
  qualityText: { color: "#8696a0", fontWeight: "600" },
  qualityTextActive: { color: "#fff" },
  grid: { paddingHorizontal: 12, paddingBottom: 8 },
  thumbWrap: { width: "33.33%", aspectRatio: 1, padding: 4, position: "relative" },
  thumb: { flex: 1, borderRadius: 8, backgroundColor: "#14131F" },
  gifBadge: { position: "absolute", bottom: 10, left: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  gifText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  caption: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#202c33",
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 16,
    maxHeight: 80,
  },
  sendBtn: {
    marginHorizontal: 16,
    backgroundColor: "#5B4FE8",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
