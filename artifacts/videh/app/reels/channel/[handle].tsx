import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
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
import { ReelsOwnerVideoMenu, type OwnerVideoMenuAction } from "@/components/ReelsOwnerVideoMenu";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  formatVideoCountLabel,
  linkDisplayHost,
  truncateChannelBio,
} from "@/lib/channelLinkUtils";
import {
  addReelsVideoToPlaylist,
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
import { addToPlayQueue, addToWatchLater } from "@/lib/reelsLibrary";
import { shareReelsChannelLink, shareReelsVideoLink } from "@/lib/reelsShare";
import { downloadReelsVideoToApp, saveReelsVideoToDevice } from "@/lib/reelsVideoDownload";

const SCREEN_W = Dimensions.get("window").width;
const COVER_H = 120;
const COVER_H_MARGIN = 16;
const COVER_RADIUS = 12;
const COVER_W = SCREEN_W - COVER_H_MARGIN * 2;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);
const PLAYLIST_THUMB_W = 168;
const PLAYLIST_THUMB_H = Math.round((PLAYLIST_THUMB_W * 9) / 16);

const OWNER_THUMB_W = 168;
const OWNER_THUMB_H = Math.round((OWNER_THUMB_W * 9) / 16);

type ChannelTab = "home" | "videos" | "playlists";
type VideoSort = "latest" | "popular" | "oldest";

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
  const [menuVideo, setMenuVideo] = useState<ReelsVideo | null>(null);
  const [playlistPickerVideo, setPlaylistPickerVideo] = useState<ReelsVideo | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);

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
    } else if (videoSort === "oldest") {
      list.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
        return ta - tb || a.id - b.id;
      });
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

  const handleOwnerMenuAction = (action: OwnerVideoMenuAction, item: ReelsVideo) => {
    if (!user?.dbId || !channel?.isOwner) return;
    switch (action) {
      case "promote":
        void Linking.openURL(`https://ads.videh.co.in/?videoId=${item.id}`).catch(() => {
          Alert.alert("Promote", "Open ads.videh.co.in to promote this video.");
        });
        break;
      case "edit":
        router.push({ pathname: "/reels/video/edit/[id]", params: { id: String(item.id) } });
        break;
      case "save_to_device":
        void saveReelsVideoToDevice(item).catch(() => {
          Alert.alert("Error", "Could not save video to device.");
        });
        break;
      case "delete":
        confirmDeleteVideo(item);
        break;
      case "play_next":
        void addToPlayQueue(item).then((added) => {
          Alert.alert(
            added ? "Added to queue" : "Already in queue",
            added ? `"${item.title}" will play next.` : "This video is already in your queue.",
          );
        });
        break;
      case "watch_later":
        void addToWatchLater(item).then((added) => {
          Alert.alert(
            added ? "Saved" : "Already saved",
            added ? `"${item.title}" added to Watch Later.` : "This video is already in Watch Later.",
          );
        });
        break;
      case "save_playlist":
        if (playlists.length === 0) {
          Alert.alert("No playlists", "Create a playlist first.", [
            { text: "Cancel", style: "cancel" },
            { text: "Create", onPress: promptCreatePlaylist },
          ]);
        } else {
          setPlaylistPickerVideo(item);
        }
        break;
      case "download":
        void downloadReelsVideoToApp(item).catch(() => {
          Alert.alert("Error", "Download failed.");
        });
        break;
      case "share":
        void shareReelsVideoLink(item, user.dbId, user.sessionToken);
        break;
      case "studio":
        router.push({ pathname: "/reels/video/edit/[id]", params: { id: String(item.id) } });
        break;
      default:
        break;
    }
  };

  const addVideoToPlaylist = async (playlistId: number) => {
    if (!user?.dbId || !playlistPickerVideo) return;
    setAddingToPlaylist(true);
    try {
      const res = await addReelsVideoToPlaylist(
        user.dbId,
        playlistId,
        playlistPickerVideo.id,
        user.sessionToken,
      );
      if (!res.success) {
        Alert.alert("Error", res.message ?? "Could not add to playlist.");
        return;
      }
      setPlaylists(res.playlists ?? playlists);
      setPlaylistPickerVideo(null);
      Alert.alert("Saved", `"${playlistPickerVideo.title}" added to playlist.`);
    } finally {
      setAddingToPlaylist(false);
    }
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
      Alert.alert("Title", "Enter a playlist name.");
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
              onShare={() => {
                void shareReelsChannelLink({
                  handle: channel.handle,
                  displayName: channel.displayName,
                });
              }}
              onAnalytics={() => setAnalyticsOpen(true)}
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
            ownerCompact={Boolean(channel.isOwner) && tab === "videos"}
            onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } })}
            onMenu={() => setMenuVideo(item)}
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

      <ReelsOwnerVideoMenu
        visible={menuVideo != null}
        videoTitle={menuVideo?.title}
        onClose={() => setMenuVideo(null)}
        onAction={(action) => {
          if (menuVideo) handleOwnerMenuAction(action, menuVideo);
        }}
      />

      <Modal
        visible={analyticsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAnalyticsOpen(false)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Channel analytics</Text>
            <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
              Overview for @{channel.handle}
            </Text>
            <View style={styles.analyticsGrid}>
              <AnalyticsStat label="Subscribers" value={formatViewCount(channel.subscriberCount)} colors={colors} />
              <AnalyticsStat label="Total views" value={formatViewCount(channel.totalViews)} colors={colors} />
              <AnalyticsStat label="Watch hours" value={formatViewCount(Math.round(channel.totalViewHours))} colors={colors} />
              <AnalyticsStat label="Videos" value={String(videoCount)} colors={colors} />
              <AnalyticsStat label="Likes" value={formatViewCount(channel.totalLikes ?? 0)} colors={colors} />
              <AnalyticsStat label="Comments" value={formatViewCount(channel.totalComments ?? 0)} colors={colors} />
            </View>
            <TouchableOpacity onPress={() => setAnalyticsOpen(false)} style={[styles.subBtn, { backgroundColor: colors.muted, alignSelf: "stretch", marginTop: 8 }]}>
              <Text style={[styles.subBtnText, { color: colors.foreground, textAlign: "center" }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={playlistPickerVideo != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPlaylistPickerVideo(null)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Save to playlist</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {playlists.map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={[styles.playlistPickRow, { borderBottomColor: colors.border }]}
                  disabled={addingToPlaylist}
                  onPress={() => void addVideoToPlaylist(pl.id)}
                >
                  <Ionicons name="list" size={20} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                      {pl.title}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{pl.videoCount} videos</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setPlaylistPickerVideo(null)} style={styles.modalBtn}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

function AnalyticsStat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.analyticsStat, { backgroundColor: colors.muted }]}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16 }}>{value}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
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
  onShare,
  onAnalytics,
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
  onShare: () => void;
  onAnalytics: () => void;
  onAbout: () => void;
  onSubscribe: () => void;
}) {
  return (
    <>
      <View style={[styles.topNav, { paddingTop: insetsTop + 4, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={onBack} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.navActions}>
          <TouchableOpacity onPress={onShare} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
          {channel.isOwner ? (
            <TouchableOpacity onPress={onEdit} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="create-outline" size={22} color={colors.foreground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.coverWrap}>
        <ChannelCover uri={channel.coverUrl} channelId={channel.id} fallbackColor={colors.primary} />
      </View>

      <View style={styles.profile}>
        <View style={styles.avatarOverlapRow}>
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
        </View>

        <View style={styles.channelMeta}>
          <Text style={[styles.displayName, { color: colors.foreground }]}>{displayLabel}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>@{channel.handle}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>
            {formatViewCount(channel.subscriberCount)} subscribers · {formatVideoCountLabel(videoCount)}
          </Text>
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
          <View style={styles.ownerActionsRow}>
            <TouchableOpacity
              style={[styles.ownerActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={onAnalytics}
            >
              <Ionicons name="bar-chart-outline" size={18} color={colors.foreground} />
              <Text style={[styles.ownerActionText, { color: colors.foreground }]}>Analytics</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ownerActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={onShare}
            >
              <Ionicons name="share-outline" size={18} color={colors.foreground} />
              <Text style={[styles.ownerActionText, { color: colors.foreground }]}>Share channel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ownerActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={onEdit}
            >
              <Ionicons name="create-outline" size={18} color={colors.foreground} />
              <Text style={[styles.ownerActionText, { color: colors.foreground }]}>Edit channel</Text>
            </TouchableOpacity>
          </View>
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
    { id: "oldest", label: "Oldest" },
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
  ownerCompact,
  onPress,
  onMenu,
}: {
  item: ReelsVideo;
  channel: ReelsChannel;
  colors: ReturnType<typeof useColors>;
  isOwner: boolean;
  ownerCompact?: boolean;
  onPress: () => void;
  onMenu: () => void;
}) {
  if (ownerCompact) {
    return (
      <View style={styles.ownerVideoRow}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.ownerVideoMain}>
          <View style={styles.ownerThumbWrap}>
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.ownerThumb} contentFit="cover" />
            ) : (
              <View style={[styles.ownerThumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="videocam" size={28} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
            </View>
          </View>
          <View style={styles.ownerVideoInfo}>
            <View style={styles.ownerTitleRow}>
              <Text style={[styles.ownerTitle, { color: colors.foreground }]} numberOfLines={2}>
                {item.title}
              </Text>
              <TouchableOpacity
                onPress={onMenu}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.menuBtn}
              >
                <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
              {formatViewCount(item.viewCount)} views{item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
            </Text>
            {item.status !== "published" || item.moderationStatus === "pending_scan" || item.moderationStatus === "pending_review" ? (
              <Text style={{ color: "#e6a700", fontSize: 11, marginTop: 4 }}>
                {item.moderationStatus === "rejected" ? "Blocked" : "Under review"}
              </Text>
            ) : null}
            <View style={styles.ownerStatsRow}>
              <Ionicons name="globe-outline" size={14} color={colors.mutedForeground} />
              <View style={styles.ownerStatItem}>
                <Ionicons name="thumbs-up-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.ownerStatText, { color: colors.mutedForeground }]}>
                  {formatViewCount(item.likeCount)}
                </Text>
              </View>
              <View style={styles.ownerStatItem}>
                <Ionicons name="chatbubble-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.ownerStatText, { color: colors.mutedForeground }]}>
                  {formatViewCount(item.commentCount)}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

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
          {isOwner ? (
            <TouchableOpacity onPress={onMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-vertical" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
      {item.status !== "published" || item.moderationStatus === "pending_scan" || item.moderationStatus === "pending_review" ? (
        <View style={styles.videoFooter}>
          <Text style={{ color: "#e6a700", fontSize: 11 }}>
            {item.moderationStatus === "rejected" ? "Blocked" : "Under review"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  navActions: { flexDirection: "row", alignItems: "center" },
  navBtn: { padding: 8 },
  coverWrap: {
    marginHorizontal: COVER_H_MARGIN,
    borderRadius: COVER_RADIUS,
    overflow: "hidden",
    height: COVER_H,
  },
  cover: { width: COVER_W, height: COVER_H },
  profile: { paddingHorizontal: 16, paddingBottom: 12 },
  avatarOverlapRow: { marginTop: -36, marginBottom: 4 },
  channelMeta: { marginTop: 4 },
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
  ownerActionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  ownerActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  ownerActionText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  ownerVideoRow: { paddingHorizontal: 16, marginBottom: 16 },
  ownerVideoMain: { flexDirection: "row", gap: 12 },
  ownerThumbWrap: { position: "relative" },
  ownerThumb: { width: OWNER_THUMB_W, height: OWNER_THUMB_H, borderRadius: 8 },
  ownerVideoInfo: { flex: 1, minWidth: 0 },
  ownerTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  ownerTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 18 },
  menuBtn: { paddingTop: 2, paddingLeft: 4 },
  ownerStatsRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  ownerStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  ownerStatText: { fontSize: 12 },
  analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  analyticsStat: { width: "47%", borderRadius: 10, padding: 12 },
  playlistPickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
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
