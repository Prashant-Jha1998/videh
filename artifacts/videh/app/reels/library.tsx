import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  ScrollView,
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
import {
  createReelsPlaylist,
  fetchReelsLibrary,
  formatDuration,
  type ReelsChannel,
  type ReelsPlaylist,
  type ReelsVideo,
} from "@/lib/reelsApi";
import {
  getDownloadedVideos,
  getWatchHistory,
  getWatchLaterVideos,
  type DownloadedReelsVideo,
  type SavedReelsVideo,
} from "@/lib/reelsLibrary";

const RAIL_W = 168;
const THUMB_H = Math.round((RAIL_W * 9) / 16);
const GRID_W = Dimensions.get("window").width;
const GRID_THUMB_H = Math.round(((GRID_W - 48) / 2) * 9 / 16);

type LibrarySection = "history" | "liked" | "downloads" | "your-videos" | "watch-later";

function mergeHistory(server: ReelsVideo[], local: SavedReelsVideo[]): ReelsVideo[] {
  const seen = new Set<number>();
  const out: ReelsVideo[] = [];
  for (const v of server) {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  }
  for (const s of local) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s as ReelsVideo);
    }
  }
  return out.slice(0, 30);
}

function RailThumb({
  uri,
  duration,
  count,
  placeholderColor,
}: {
  uri?: string | null;
  duration?: number;
  count?: number;
  placeholderColor: string;
}) {
  return (
    <View style={[styles.railThumb, { backgroundColor: placeholderColor }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <View style={styles.railThumbEmpty}>
          <Ionicons name="play" size={28} color="#888" />
        </View>
      )}
      {duration != null ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      ) : null}
      {count != null ? (
        <View style={styles.plCountBadge}>
          <Text style={styles.durationText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RailVideoCard({
  video,
  onPress,
  colors,
}: {
  video: SavedReelsVideo | ReelsVideo;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const channel = video.channelHandle ? `@${video.channelHandle}` : "Videh";
  return (
    <TouchableOpacity style={styles.railCard} onPress={onPress} activeOpacity={0.85}>
      <RailThumb uri={video.thumbnailUrl} duration={video.durationSeconds} placeholderColor={colors.muted} />
      <Text style={[styles.railTitle, { color: colors.foreground }]} numberOfLines={2}>
        {video.title}
      </Text>
      <Text style={[styles.railSub, { color: colors.mutedForeground }]} numberOfLines={1}>
        {channel}
      </Text>
    </TouchableOpacity>
  );
}

function PlaylistRailCard({
  title,
  thumbUri,
  count,
  onPress,
  colors,
}: {
  title: string;
  thumbUri?: string | null;
  count: number;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity style={styles.railCard} onPress={onPress} activeOpacity={0.85}>
      <RailThumb uri={thumbUri} count={count} placeholderColor={colors.muted} />
      <Text style={[styles.railTitle, { color: colors.foreground }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.railSub, { color: colors.mutedForeground }]}>Playlist</Text>
    </TouchableOpacity>
  );
}

export default function ReelsLibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { t } = useUiPreferences();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const activeSection = section as LibrarySection | undefined;

  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [history, setHistory] = useState<ReelsVideo[]>([]);
  const [liked, setLiked] = useState<ReelsVideo[]>([]);
  const [playlists, setPlaylists] = useState<ReelsPlaylist[]>([]);
  const [myVideos, setMyVideos] = useState<ReelsVideo[]>([]);
  const [watchLater, setWatchLater] = useState<SavedReelsVideo[]>([]);
  const [downloads, setDownloads] = useState<DownloadedReelsVideo[]>([]);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const displayName = user?.name || user?.phone || t("reels.libraryYou");
  const initial = (displayName.replace(/\s/g, "")[0] ?? "V").toUpperCase();
  const profileUri = channel?.avatarUrl ?? user?.avatar ?? null;

  const load = useCallback(async () => {
    const [localHistory, localLater, localDownloads] = await Promise.all([
      getWatchHistory(),
      getWatchLaterVideos(),
      getDownloadedVideos(),
    ]);
    setWatchLater(localLater);
    setDownloads(localDownloads);

    if (!user?.dbId) {
      setHistory(mergeHistory([], localHistory));
      setLiked([]);
      setPlaylists([]);
      setMyVideos([]);
      setChannel(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchReelsLibrary(user.dbId, user.sessionToken);
      if (res.success) {
        setChannel(res.channel ?? null);
        setHistory(mergeHistory(res.history ?? [], localHistory));
        setLiked(res.liked ?? []);
        setPlaylists(res.playlists ?? []);
        setMyVideos(res.myVideos ?? []);
      } else {
        setHistory(mergeHistory([], localHistory));
      }
    } catch {
      setHistory(mergeHistory([], localHistory));
    } finally {
      setLoading(false);
    }
  }, [user?.dbId, user?.sessionToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openVideo = (id: number) => {
    router.push({ pathname: "/reels/watch/[id]", params: { id: String(id) } });
  };

  const openSection = (s: LibrarySection) => {
    router.push({ pathname: "/reels/library", params: { section: s } });
  };

  const openPlaylist = (pl: ReelsPlaylist) => {
    if (pl.id === -1) {
      openSection("liked");
      return;
    }
    if (pl.id === -2) {
      openSection("watch-later");
      return;
    }
    if (!channel?.handle) {
      Alert.alert(t("reels.libraryChannelNeeded"), t("reels.libraryChannelNeededHint"));
      router.push("/reels/setup");
      return;
    }
    router.push({
      pathname: "/reels/channel/playlist/[id]",
      params: { id: String(pl.id), handle: channel.handle },
    });
  };

  const onCreatePlaylist = async () => {
    const title = newPlaylistTitle.trim();
    if (!user?.dbId || !title) return;
    setCreatingPlaylist(true);
    try {
      const res = await createReelsPlaylist(user.dbId, { title }, user.sessionToken);
      if (res.success && res.playlists) {
        setPlaylists(res.playlists);
        setNewPlaylistTitle("");
      } else {
        Alert.alert(t("common.error"), res.message ?? t("reels.libraryPlaylistFailed"));
      }
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const playlistCards = useMemo(() => {
    const likedPl: ReelsPlaylist = {
      id: -1,
      title: t("reels.libraryLiked"),
      videoCount: liked.length,
      thumbnailUrl: liked[0]?.thumbnailUrl ?? null,
    };
    const laterPl: ReelsPlaylist = {
      id: -2,
      title: t("reels.libraryWatchLater"),
      videoCount: watchLater.length,
      thumbnailUrl: watchLater[0]?.thumbnailUrl ?? null,
    };
    return [likedPl, laterPl, ...playlists];
  }, [liked, watchLater, playlists, t]);

  const sectionVideos = useMemo((): ReelsVideo[] => {
    switch (activeSection) {
      case "history":
        return history;
      case "liked":
        return liked;
      case "your-videos":
        return myVideos;
      case "watch-later":
        return watchLater as ReelsVideo[];
      default:
        return [];
    }
  }, [activeSection, history, liked, myVideos, watchLater]);

  const sectionTitle = useMemo(() => {
    switch (activeSection) {
      case "history":
        return t("reels.libraryHistory");
      case "liked":
        return t("reels.libraryLiked");
      case "downloads":
        return t("reels.libraryDownloads");
      case "your-videos":
        return t("reels.libraryYourVideos");
      case "watch-later":
        return t("reels.libraryWatchLater");
      default:
        return t("reels.libraryTitle");
    }
  }, [activeSection, t]);

  const renderGridVideo = ({ item }: { item: ReelsVideo }) => (
    <TouchableOpacity
      style={[styles.gridCard, { width: (GRID_W - 48) / 2 }]}
      onPress={() => openVideo(item.id)}
      activeOpacity={0.85}
    >
      <View style={[styles.gridThumb, { height: GRID_THUMB_H, backgroundColor: colors.muted }]}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : null}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      </View>
      <Text style={[styles.railTitle, { color: colors.foreground, marginTop: 8 }]} numberOfLines={2}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !activeSection) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => (activeSection ? router.replace("/reels/library" as never) : router.back())}
          style={styles.back}
        >
          <Ionicons name={activeSection ? "arrow-back" : "close"} size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {sectionTitle}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {activeSection === "downloads" ? (
        <FlatList
          data={downloads}
          keyExtractor={(d) => String(d.id)}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, padding: 8 }}>{t("reels.libraryDownloadsEmpty")}</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.gridCard, { width: (GRID_W - 48) / 2 }]}
              onPress={() => openVideo(item.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.gridThumb, { height: GRID_THUMB_H, backgroundColor: colors.muted }]}>
                {item.thumbnailUrl ? (
                  <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : null}
                <View style={styles.offlineBadge}>
                  <Ionicons name="download" size={12} color="#fff" />
                </View>
              </View>
              <Text style={[styles.railTitle, { color: colors.foreground, marginTop: 8 }]} numberOfLines={2}>
                {item.title}
              </Text>
            </TouchableOpacity>
          )}
        />
      ) : activeSection ? (
        <FlatList
          data={sectionVideos}
          keyExtractor={(v) => String(v.id)}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <Text style={{ color: colors.mutedForeground, padding: 8 }}>{t("reels.librarySectionEmpty")}</Text>
          }
          renderItem={renderGridVideo}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <View style={styles.profileRow}>
            {profileUri ? (
              <Image source={{ uri: profileUri }} style={styles.profileAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.profileInitial}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName}</Text>
              {channel?.handle ? (
                <TouchableOpacity onPress={() => router.push({ pathname: "/reels/channel/[handle]", params: { handle: channel.handle! } })}>
                  <Text style={[styles.channelLink, { color: colors.mutedForeground }]}>{t("reels.libraryViewChannel")} ›</Text>
                </TouchableOpacity>
              ) : user ? (
                <TouchableOpacity onPress={() => router.push("/reels/setup")}>
                  <Text style={[styles.channelLink, { color: colors.mutedForeground }]}>{t("reels.createChannel")} ›</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t("reels.signInHint")}</Text>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity style={styles.sectionHead} onPress={() => openSection("history")}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("reels.libraryHistory")} ›</Text>
            </TouchableOpacity>
            {history.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {history.map((v) => (
                  <RailVideoCard key={v.id} video={v} onPress={() => openVideo(v.id)} colors={colors} />
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t("reels.libraryHistoryEmpty")}</Text>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <TouchableOpacity onPress={() => channel?.handle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: channel.handle } })}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("reels.libraryPlaylists")} ›</Text>
              </TouchableOpacity>
              {user ? (
                <View style={styles.plCreateRow}>
                  <TextInput
                    value={newPlaylistTitle}
                    onChangeText={setNewPlaylistTitle}
                    placeholder={t("reels.libraryNewPlaylist")}
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.plInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  />
                  <TouchableOpacity
                    style={[styles.plAddBtn, { backgroundColor: colors.muted }]}
                    disabled={creatingPlaylist || !newPlaylistTitle.trim()}
                    onPress={() => void onCreatePlaylist()}
                  >
                    <Ionicons name="add" size={22} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {playlistCards.map((pl) => (
                <PlaylistRailCard
                  key={pl.id}
                  title={pl.title}
                  thumbUri={pl.thumbnailUrl}
                  count={pl.videoCount ?? 0}
                  onPress={() => openPlaylist(pl)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          </View>

          <View style={[styles.menu, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => openSection("your-videos")}>
              <Ionicons name="albums-outline" size={22} color={colors.foreground} />
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{t("reels.libraryYourVideos")}</Text>
              {myVideos.length > 0 ? (
                <Text style={{ color: colors.mutedForeground }}>{myVideos.length}</Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => openSection("downloads")}>
              <Ionicons name="download-outline" size={22} color={colors.foreground} />
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{t("reels.libraryDownloads")}</Text>
              {downloads.length > 0 ? (
                <Text style={{ color: colors.mutedForeground }}>{downloads.length}</Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => openSection("liked")}>
              <Ionicons name="heart-outline" size={22} color={colors.foreground} />
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{t("reels.libraryLiked")}</Text>
              {liked.length > 0 ? (
                <Text style={{ color: colors.mutedForeground }}>{liked.length}</Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push("/reels/upload")}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.foreground} />
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{t("reels.uploadVideo")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: "Inter_700Bold", fontSize: 17 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, overflow: "hidden" },
  profileInitial: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 28, textAlign: "center", lineHeight: 72 },
  profileName: { fontFamily: "Inter_700Bold", fontSize: 20, marginBottom: 4 },
  channelLink: { fontSize: 14 },
  section: { marginBottom: 20, paddingHorizontal: 16 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  rail: { gap: 10, paddingRight: 16 },
  railCard: { width: RAIL_W },
  railThumb: { width: RAIL_W, height: THUMB_H, borderRadius: 10, overflow: "hidden" },
  railThumbEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  railTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 8 },
  railSub: { fontSize: 12, marginTop: 2 },
  durationBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  plCountBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(91,79,232,0.9)",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyHint: { fontSize: 13 },
  plCreateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  plInput: {
    width: 110,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
  },
  plAddBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  menu: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  menuLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15 },
  gridRow: { justifyContent: "space-between", marginBottom: 16 },
  gridCard: {},
  gridThumb: { borderRadius: 10, overflow: "hidden" },
});
