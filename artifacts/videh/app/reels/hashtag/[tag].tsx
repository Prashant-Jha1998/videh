import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  fetchHashtagReels,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  type ReelsHashtagStat,
  type ReelsVideo,
} from "@/lib/reelsApi";

export default function ReelsHashtagScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReelsHashtagStat | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);

  const load = useCallback(async () => {
    if (!user?.dbId || !tag) return;
    setLoading(true);
    try {
      const res = await fetchHashtagReels(String(tag), user.dbId, user.sessionToken);
      if (res.success) {
        setStats(res.hashtag ?? null);
        setVideos(res.videos ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tag, user?.dbId, user?.sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayTag = `#${String(tag ?? "").replace(/^#/, "")}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{displayTag}</Text>
          {stats ? (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>
              {stats.videoCount} {stats.videoCount === 1 ? "video" : "videos"} · {formatViewCount(stats.viewCount)} views
            </Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12 }}
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 40 }}>
              Is hashtag par abhi koi public video nahi hai.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } })}
            >
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.muted }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                  {formatViewCount(item.viewCount)} views
                  {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
                </Text>
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {formatDuration(item.durationSeconds)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  thumb: { width: 120, height: 68, borderRadius: 8 },
});
