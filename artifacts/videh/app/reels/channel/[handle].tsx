import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReelsChannelAboutSheet } from "@/components/ReelsChannelAboutSheet";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  formatVideoCountLabel,
  linkDisplayHost,
  truncateChannelBio,
} from "@/lib/channelLinkUtils";
import {
  channelBrandingApiUrl,
  createReelsPlaylist,
  deleteReelsPlaylist,
  deleteReelsVideo,
  fetchMyReelsChannel,
  fetchReelsChannel,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsChannel,
  type ReelsChannelLink,
  type ReelsPlaylist,
  type ReelsVideo,
} from "@/lib/reelsApi";

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);
const PLAYLIST_THUMB_W = 168;
const PLAYLIST_THUMB_H = Math.round((PLAYLIST_THUMB_W * 9) / 16);

type ChannelTab = "home" | "videos" | "playlists";
type VideoSort = "latest" | "popular";

export default function ReelsChannelScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [links, setLinks] = useState<ReelsChannelLink[]>([]);
  const [playlists, setPlaylists] = useState<ReelsPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ChannelTab>("home");
  const [videoSort, setVideoSort] = useState<VideoSort>("latest");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const load = useCallback(async () => {
    if (!user?.dbId) return;
    setLoading(true);
    let handle = rawHandle ?? "";
    if (handle === "me") {
      const mine = await fetchMyReelsChannel(user.dbId, user.sessionToken);
      if (!mine.channel) {
        router.replace("/reels/setup");
        return;
      }
      handle = mine.channel.handle;
    }
    const res = await fetchReelsChannel(handle, user.dbId, user.sessionToken);
    if (res.success && res.channel) {
      setChannel(res.channel);
      setVideos(res.videos ?? []);
      setLinks(res.links ?? []);
      setPlaylists(res.playlists ?? []);
    }
    setLoading(false);
  }, [rawHandle, user?.dbId, user?.sessionToken, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sortedVideos = useMemo(() => {
    const list = [...videos];
    if (videoSort === "popular") {
      list.sort((a, b) => b.viewCount - a.viewCount || (b.id - a.id));
    }
    return list;
  }, [videos, videoSort]);

  const homeVideos = useMemo(() => sortedVideos.slice(0, 6), [sortedVideos]);

  const confirmDeleteVideo = (item: ReelsVideo) => {
    if (!user?.dbId || !channel?.isOwner) return;
    Alert.alert(
      "Delete video permanently?",
      `"${item.title}" will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const res = await deleteReelsVideo(item.id, user.dbId!, user.sessionToken);
              if (!res.success) {
                Alert.alert("Delete failed", res.message ?? "Please try again.");
                return;
              }
              void load();
            })();
          },
        },
      ],
    );
  };

  const promptCreatePlaylist = () => {
    if (!user?.dbId || !channel?.isOwner) return;
    setNewPlaylistTitle("");
    setPlaylistModalOpen(true);
  };

  const submitCreatePlaylist = async () => {
    if (!user?.dbId || !channel?.isOwner) return;
    const trimmed = newPlaylistTitle.trim();
    if (!trimmed) {
      Alert.alert("Title", "Playlist ka naam likhein.");
      return;
    }
    setCreatingPlaylist(true);
    try {
      const res = await createReelsPlaylist(
        user.dbId,
        { title: trimmed, videoIds: videos.map((v) => v.id) },
        user.sessionToken,
      );
      if (!res.success) {
        Alert.alert("Error", res.message ?? "Could not create playlist.");
        return;
      }
      setPlaylists(res.playlists ?? []);
      setPlaylistModalOpen(false);
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const confirmDeletePlaylist = (pl: ReelsPlaylist) => {
    if (!user?.dbId || !channel?.isOwner) return;
    Alert.alert("Delete playlist?", `"${pl.title}" delete ho jayegi.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const res = await deleteReelsPlaylist(user.dbId!, pl.id, user.sessionToken);
            if (!res.success) {
              Alert.alert("Error", res.message ?? "Could not delete.");
              return;
            }
            setPlaylists(res.playlists ?? []);
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!channel) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Channel not found</Text>
      </View>
    );
  }

  const displayLabel = channel.displayName?.trim() || `@${channel.handle}`;
  const videoCount = channel.videoCount ?? videos.length;
  const bioPreview = channel.bio ? truncateChannelBio(channel.bio) : null;
  const showAboutEntry = Boolean(channel.bio || links.length > 0 || channel.createdAt);

  const listData =
    tab === "home"
      ? homeVideos
      : tab === "videos"
        ? sortedVideos
        : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={listData}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <>
            <ChannelHeader
              channel={channel}
              colors={colors}
              insetsTop={insets.top}
              displayLabel={displayLabel}
              videoCount={videoCount}
              bioPreview={bioPreview}
              links={links}
              showAboutEntry={showAboutEntry}
              onBack={() => router.back()}
              onEdit={() => router.push("/reels/channel/edit")}
              onAbout={() => setAboutOpen(true)}
              onSubscribe={async () => {
                if (!user?.dbId) return;
                if (channel.isSubscribed) {
                  await unsubscribeReelsChannel(channel.id, user.dbId, user.sessionToken);
                } else {
                  await subscribeReelsChannel(channel.id, user.dbId, user.sessionToken);
                }
                void load();
              }}
            />

            <ChannelTabs tab={tab} onTab={setTab} colors={colors} />

            {tab === "videos" ? (
              <VideoSortChips sort={videoSort} onSort={setVideoSort} colors={colors} />
            ) : null}

            {tab === "playlists" ? (
              <PlaylistsSection
                playlists={playlists}
                channel={channel}
                colors={colors}
                isOwner={Boolean(channel.isOwner)}
                onCreate={promptCreatePlaylist}
                onDelete={confirmDeletePlaylist}
                onOpen={(pl) =>
                  router.push({
                    pathname: "/reels/channel/playlist/[id]",
                    params: { id: String(pl.id), handle: channel.handle },
                  })
                }
              />
            ) : null}

            {tab === "home" && homeVideos.length > 0 ? (
              <Text style={[styles.section, { color: colors.foreground }]}>Videos</Text>
            ) : null}
            {tab === "videos" && sortedVideos.length > 0 ? (
              <View style={{ height: 4 }} />
            ) : null}
          </>
        }
        ListEmptyComponent={
          tab === "playlists" ? null : (
            <Text style={{ color: colors.mutedForeground, padding: 20 }}>
              {tab === "home" ? "No videos yet" : "No videos posted yet"}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <VideoCard
            item={item}
            channel={channel}
            colors={colors}
            isOwner={Boolean(channel.isOwner)}
            onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } })}
            onDelete={() => confirmDeleteVideo(item)}
          />
        )}
      />

      <ReelsChannelAboutSheet
        visible={aboutOpen}
        onClose={() => setAboutOpen(false)}
        channel={channel}
        links={links}
        videoCount={videoCount}
      />

      <Modal visible={playlistModalOpen} transparent animationType="fade" onRequestClose={() => setPlaylistModalOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New playlist</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Playlist name"
              placeholderTextColor={colors.mutedForeground}
              value={newPlaylistTitle}
              onChangeText={setNewPlaylistTitle}
              maxLength={200}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setPlaylistModalOpen(false)} style={styles.modalBtn}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitCreatePlaylist()}
                style={[styles.modalBtn, { opacity: creatingPlaylist ? 0.6 : 1 }]}
                disabled={creatingPlaylist}
              >
                {creatingPlaylist ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChannelCover({
  uri,
  channelId,
  fallbackColor,
}: {
  uri: string | null | undefined;
  channelId: number;
  fallbackColor: string;
}) {
  const [src, setSrc] = useState(uri ?? null);
  const triedApiFallback = useRef(false);

  useEffect(() => {
    setSrc(uri ?? null);
    triedApiFallback.current = false;
  }, [uri]);

  if (!src) {
    return <View style={[styles.cover, { backgroundColor: fallbackColor }]} />;
  }

  const apiFallback = channelBrandingApiUrl(channelId, "cover");

  return (
    <Image
      source={{ uri: src }}
      style={styles.cover}
      contentFit="cover"
      cacheKey={`cover-${channelId}-${src}`}
      onError={() => {
        if (!triedApiFallback.current && src !== apiFallback) {
          triedApiFallback.current = true;
          setSrc(apiFallback);
        }
      }}
    />
  );
}

function ChannelHeader({
  channel,
  colors,
  insetsTop,
  displayLabel,
  videoCount,
  bioPreview,
  links,
  showAboutEntry,
  onBack,
  onEdit,
  onAbout,
  onSubscribe,
}: {
  channel: ReelsChannel;
  colors: ReturnType<typeof useColors>;
  insetsTop: number;
  displayLabel: string;
  videoCount: number;
  bioPreview: { text: string; truncated: boolean } | null;
  links: ReelsChannelLink[];
  showAboutEntry: boolean;
  onBack: () => void;
  onEdit: () => void;
  onAbout: () => void;
  onSubscribe: () => void;
}) {
  return (
    <>
      <View style={styles.coverWrap}>
        <ChannelCover uri={channel.coverUrl} channelId={channel.id} fallbackColor={colors.primary} />
        <View style={[styles.headerBar, { paddingTop: insetsTop + 8 }]}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          {channel.isOwner ? (
            <TouchableOpacity onPress={onEdit} style={styles.backBtn}>
              <Ionicons name="create-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.profile}>
        <View style={styles.avatarRow}>
          {channel.avatarUrl ? (
            <Image
              source={{ uri: channel.avatarUrl }}
              style={styles.avatar}
              cacheKey={`avatar-${channel.id}-${channel.avatarUrl}`}
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" }}>@</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.displayName, { color: colors.foreground }]}>{displayLabel}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>@{channel.handle}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>
              {formatViewCount(channel.subscriberCount)} subscribers · {formatVideoCountLabel(videoCount)}
            </Text>
          </View>
        </View>

        {bioPreview ? (
          <Text style={[styles.bio, { color: colors.foreground }]}>
            {bioPreview.text}
            {bioPreview.truncated || showAboutEntry ? (
              <>
                {" "}
                <Text style={{ color: colors.mutedForeground }} onPress={onAbout}>
                  ...more
                </Text>
              </>
            ) : null}
          </Text>
        ) : showAboutEntry ? (
          <TouchableOpacity onPress={onAbout}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>About this channel</Text>
          </TouchableOpacity>
        ) : null}

        {links.length > 0 ? (
          <TouchableOpacity style={styles.linksPreview} onPress={onAbout}>
            <Ionicons name="link-outline" size={16} color={colors.mutedForeground} />
            <Text style={{ color: colors.primary, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {linkDisplayHost(links[0].url)}
              {links.length > 1 ? ` and ${links.length - 1} more link${links.length - 1 > 1 ? "s" : ""}` : ""}
            </Text>
          </TouchableOpacity>
        ) : null}

        {channel.isOwner ? (
          <TouchableOpacity
            style={[styles.subBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={onEdit}
          >
            <Text style={[styles.subBtnText, { color: colors.foreground }]}>Customize channel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.subBtn,
              channel.isSubscribed
                ? { backgroundColor: colors.muted }
                : { backgroundColor: colors.foreground },
            ]}
            onPress={onSubscribe}
          >
            <Text
              style={[
                styles.subBtnText,
                { color: channel.isSubscribed ? colors.foreground : colors.background },
              ]}
            >
              {channel.isSubscribed ? "Subscribed" : "Subscribe"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

function ChannelTabs({
  tab,
  onTab,
  colors,
}: {
  tab: ChannelTab;
  onTab: (t: ChannelTab) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const tabs: { id: ChannelTab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "videos", label: "Videos" },
    { id: "playlists", label: "Playlists" },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.tabBar, { borderBottomColor: colors.border }]}
      contentContainerStyle={styles.tabBarInner}
    >
      {tabs.map((t) => (
        <TouchableOpacity key={t.id} style={styles.tabItem} onPress={() => onTab(t.id)}>
          <Text
            style={[
              styles.tabLabel,
              { color: tab === t.id ? colors.foreground : colors.mutedForeground },
              tab === t.id && styles.tabLabelActive,
            ]}
          >
            {t.label}
          </Text>
          {tab === t.id ? <View style={[styles.tabUnderline, { backgroundColor: colors.foreground }]} /> : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function VideoSortChips({
  sort,
  onSort,
  colors,
}: {
  sort: VideoSort;
  onSort: (s: VideoSort) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const chips: { id: VideoSort; label: string }[] = [
    { id: "latest", label: "Latest" },
    { id: "popular", label: "Popular" },
  ];
  return (
    <View style={styles.chipsRow}>
      {chips.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={[
            styles.chip,
            {
              backgroundColor: sort === c.id ? colors.foreground : colors.muted,
            },
          ]}
          onPress={() => onSort(c.id)}
        >
          <Text
            style={{
              color: sort === c.id ? colors.background : colors.foreground,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            {c.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PlaylistsSection({
  playlists,
  channel,
  colors,
  isOwner,
  onCreate,
  onDelete,
  onOpen,
}: {
  playlists: ReelsPlaylist[];
  channel: ReelsChannel;
  colors: ReturnType<typeof useColors>;
  isOwner: boolean;
  onCreate: () => void;
  onDelete: (pl: ReelsPlaylist) => void;
  onOpen: (pl: ReelsPlaylist) => void;
}) {
  if (playlists.length === 0) {
    return (
      <View style={styles.playlistEmpty}>
        <Text style={{ color: colors.mutedForeground }}>No playlists yet</Text>
        {isOwner ? (
          <TouchableOpacity style={[styles.subBtn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={onCreate}>
            <Text style={[styles.subBtnText, { color: "#fff" }]}>Create playlist</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.playlistSection}>
      {isOwner ? (
        <TouchableOpacity style={styles.createPlaylistBtn} onPress={onCreate}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>New playlist</Text>
        </TouchableOpacity>
      ) : null}
      {playlists.map((pl) => (
        <TouchableOpacity key={pl.id} style={styles.playlistRow} onPress={() => onOpen(pl)}>
          <View style={styles.playlistThumbWrap}>
            {pl.thumbnailUrl ? (
              <Image source={{ uri: pl.thumbnailUrl }} style={styles.playlistThumb} contentFit="cover" />
            ) : (
              <View style={[styles.playlistThumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="list" size={28} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.playlistCountBadge}>
              <Text style={styles.playlistCountText}>{pl.videoCount}</Text>
              <Ionicons name="logo-youtube" size={10} color="#fff" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.playlistTitle, { color: colors.foreground }]} numberOfLines={2}>{pl.title}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
              {channel.displayName ?? `@${channel.handle}`} · Playlist
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
              {pl.videoCount} video{pl.videoCount === 1 ? "" : "s"}
            </Text>
          </View>
          {isOwner ? (
            <TouchableOpacity onPress={() => onDelete(pl)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={18} color="#e53935" />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function VideoCard({
  item,
  channel,
  colors,
  isOwner,
  onPress,
  onDelete,
}: {
  item: ReelsVideo;
  channel: ReelsChannel;
  colors: ReturnType<typeof useColors>;
  isOwner: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.ytCard}>
      <TouchableOpacity onPress={onPress}>
        <View style={styles.thumbWrap}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="videocam" size={32} color={colors.mutedForeground} />
            </View>
          )}
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          {channel.avatarUrl ? (
            <Image
              source={{ uri: channel.avatarUrl }}
              style={styles.smallAvatar}
              cacheKey={`avatar-${channel.id}-${channel.avatarUrl}`}
            />
          ) : (
            <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
              {formatViewCount(item.viewCount)} views{item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.videoFooter}>
        {item.status !== "published" || item.moderationStatus === "pending_scan" || item.moderationStatus === "pending_review" ? (
          <Text style={{ color: "#e6a700", fontSize: 11 }}>
            {item.moderationStatus === "rejected" ? "Blocked" : "Under review"}
          </Text>
        ) : (
          <View />
        )}
        {isOwner ? (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.deleteIconBtn}>
            <Ionicons name="trash-outline" size={18} color="#e53935" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverWrap: { position: "relative" },
  cover: { width: SCREEN_W, height: 120 },
  headerBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
  backBtn: { padding: 8, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 20 },
  profile: { paddingHorizontal: 16, paddingBottom: 12, marginTop: -28 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: "#fff" },
  displayName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  bio: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  linksPreview: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 16 },
  subBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, alignSelf: "flex-start" },
  subBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 44 },
  tabBarInner: { paddingHorizontal: 8 },
  tabItem: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, alignItems: "center" },
  tabLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  tabLabelActive: { fontFamily: "Inter_700Bold" },
  tabUnderline: { height: 2, width: "100%", marginTop: 8, borderRadius: 1 },
  chipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  section: { fontSize: 16, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, marginBottom: 8, marginTop: 8 },
  ytCard: { marginBottom: 12 },
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
  infoRow: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, gap: 10, alignItems: "flex-start" },
  smallAvatar: { width: 36, height: 36, borderRadius: 18 },
  videoFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  deleteIconBtn: { padding: 4 },
  playlistSection: { paddingHorizontal: 16, paddingTop: 8 },
  playlistEmpty: { padding: 32, alignItems: "center" },
  createPlaylistBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  playlistRow: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "flex-start" },
  playlistThumbWrap: { position: "relative" },
  playlistThumb: { width: PLAYLIST_THUMB_W, height: PLAYLIST_THUMB_H, borderRadius: 8 },
  playlistCountBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  playlistCountText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  playlistTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 12 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 16 },
  modalBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 64, alignItems: "center" },
});
