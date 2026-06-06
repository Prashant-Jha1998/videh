import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { formatTimeAgo, formatViewCount, searchReels, type ReelsChannel, type ReelsVideo } from "@/lib/reelsApi";

export default function ReelsSearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [q, setQ] = useState("");
  const [channels, setChannels] = useState<ReelsChannel[]>([]);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);

  const runSearch = async () => {
    if (!user?.dbId || q.trim().length < 2) return;
    const res = await searchReels(q.trim(), user.dbId, user.sessionToken);
    if (res.success) {
      setChannels(res.channels ?? []);
      setVideos(res.videos ?? []);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          placeholder="Search channels or videos..."
          placeholderTextColor={colors.mutedForeground}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          autoFocus
        />
      </View>

      {channels.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: colors.foreground }]}>Channels</Text>
          <FlatList
            data={channels}
            keyExtractor={(c) => String(c.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push({ pathname: "/reels/channel/[handle]", params: { handle: item.handle } })}
              >
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]} />
                )}
                <View>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                    {item.displayName?.trim() || `@${item.handle}`}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {formatViewCount(item.subscriberCount)} subscribers
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      ) : null}

      {videos.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: colors.foreground }]}>Videos</Text>
          <FlatList
            data={videos}
            keyExtractor={(v) => String(v.id)}
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
                  <Text style={{ color: colors.foreground }} numberOfLines={2}>{item.title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {item.channelDisplayName ?? `@${item.channelHandle}`}
                    {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  heading: { fontFamily: "Inter_600SemiBold", fontSize: 15, paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  thumb: { width: 80, height: 45, borderRadius: 6 },
});
