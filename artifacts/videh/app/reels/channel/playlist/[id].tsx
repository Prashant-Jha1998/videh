import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  fetchReelsPlaylist,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  type ReelsPlaylist,
  type ReelsVideo,
} from "@/lib/reelsApi";

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);

export default function ReelsPlaylistScreen() {
  const { id, handle } = useLocalSearchParams<{ id: string; handle: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [playlist, setPlaylist] = useState<ReelsPlaylist | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle || !id) return;
    void (async () => {
      setLoading(true);
      const res = await fetchReelsPlaylist(handle, Number(id), user?.dbId, user?.sessionToken);
      if (res.success) {
        setPlaylist(res.playlist);
        setVideos(res.videos ?? []);
      }
      setLoading(false);
    })();
  }, [handle, id, user?.dbId, user?.sessionToken]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Playlist not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{playlist.title}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            {videos.length} video{videos.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <Text style={{ color: colors.mutedForeground, padding: 20 }}>Is playlist mein abhi koi video nahi</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } })}
          >
            <View style={styles.thumbWrap}>
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="videocam" size={28} color={colors.mutedForeground} />
                </View>
              )}
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
              </View>
            </View>
            <View style={styles.info}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {formatViewCount(item.viewCount)} views{item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  card: { marginBottom: 12 },
  thumbWrap: { position: "relative" },
  thumb: { width: SCREEN_W, height: THUMB_H },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  info: { paddingHorizontal: 12, paddingTop: 10 },
});
