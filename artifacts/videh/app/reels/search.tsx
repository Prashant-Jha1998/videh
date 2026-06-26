import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { interpolate } from "@/lib/i18n";
import { formatTimeAgo, formatViewCount, searchReels, type ReelsChannel, type ReelsVideo } from "@/lib/reelsApi";

export default function ReelsSearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { t } = useUiPreferences();
  const [q, setQ] = useState("");
  const [channels, setChannels] = useState<ReelsChannel[]>([]);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(false);

  const runSearch = async () => {
    const query = q.trim();
    if (!user?.dbId) return;
    if (query.length < 2) {
      setSearched(false);
      setChannels([]);
      setVideos([]);
      return;
    }
    setLoading(true);
    setError(false);
    setSearched(true);
    try {
      const res = await searchReels(query, user.dbId, user.sessionToken);
      if (res.success) {
        setChannels(res.channels ?? []);
        setVideos(res.videos ?? []);
      } else {
        setError(true);
        setChannels([]);
        setVideos([]);
      }
    } catch {
      setError(true);
      setChannels([]);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const hasResults = channels.length > 0 || videos.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          placeholder={t("reels.searchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void runSearch()}
          returnKeyType="search"
          autoFocus
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>{t("reels.searching")}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 12 }}>{t("reels.searchError")}</Text>
          <TouchableOpacity onPress={() => void runSearch()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("reels.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : !searched && q.trim().length > 0 && q.trim().length < 2 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>{t("reels.searchMinChars")}</Text>
        </View>
      ) : searched && !hasResults ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, marginTop: 12, textAlign: "center", paddingHorizontal: 24 }}>
            {interpolate(t("reels.noSearchResults"), { query: q.trim() })}
          </Text>
        </View>
      ) : null}

      {channels.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: colors.foreground }]}>{t("reels.channels")}</Text>
          <FlatList
            data={channels}
            keyExtractor={(c) => String(c.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push({ pathname: "/reels/channel/[handle]", params: { handle: item.handle } } as never)}
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
          <Text style={[styles.heading, { color: colors.foreground }]}>{t("reels.videos")}</Text>
          <FlatList
            data={videos}
            keyExtractor={(v) => String(v.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } } as never)}
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
  center: { alignItems: "center", justifyContent: "center", padding: 32 },
  heading: { fontFamily: "Inter_600SemiBold", fontSize: 15, paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  thumb: { width: 80, height: 45, borderRadius: 6 },
});
