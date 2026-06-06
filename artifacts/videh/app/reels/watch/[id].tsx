import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Audio } from "expo-av";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DismissibleModal } from "@/components/DismissibleModal";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  deleteReelsVideo,
  fetchReelsChannel,
  fetchReelsComments,
  fetchReelsFeed,
  fetchReelsVideo,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  postReelsComment,
  reactReelsVideo,
  recordReelsView,
  shareReelsVideo,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsChannel,
  type ReelsVideo,
} from "@/lib/reelsApi";

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);
const DESC_PREVIEW_LEN = 90;

function formatUploadDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ReelsWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [video, setVideo] = useState<ReelsVideo | null>(null);
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [related, setRelated] = useState<ReelsVideo[]>([]);
  const [comments, setComments] = useState<{ id: number; content: string; displayName: string; createdAt: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [playAllowed, setPlayAllowed] = useState(true);
  const [playBlockReasons, setPlayBlockReasons] = useState<string[]>([]);
  const [descOpen, setDescOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const watchedRef = useRef(0);
  const viewSentRef = useRef(false);

  const player = useVideoPlayer(video?.videoUrl ?? null, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.play();
  });

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  useEvent(player, "statusChange", { status: player.status });

  const load = useCallback(async () => {
    if (!user?.dbId || !id) return;
    setLoading(true);
    viewSentRef.current = false;
    watchedRef.current = 0;

    const res = await fetchReelsVideo(Number(id), user.dbId, user.sessionToken);
    if (res.success && res.video) {
      setVideo(res.video);
      setPlayAllowed(res.playAllowed !== false);
      setPlayBlockReasons(res.playBlockReasons ?? []);
      if (res.video.channelHandle) {
        const ch = await fetchReelsChannel(res.video.channelHandle, user.dbId, user.sessionToken);
        setChannel(ch.channel ?? null);
        setSubscribed(Boolean(ch.channel?.isSubscribed));
      } else {
        setChannel(null);
      }
    }

    const feed = await fetchReelsFeed(user.dbId, null, user.sessionToken);
    const currentId = Number(id);
    const list = (feed.videos ?? []).filter((v) => v.id !== currentId);
    const sameChannel = list.filter((v) => v.channelId === res.video?.channelId);
    const other = list.filter((v) => v.channelId !== res.video?.channelId);
    setRelated([...sameChannel, ...other].slice(0, 20));

    const cm = await fetchReelsComments(Number(id), user.sessionToken);
    if (cm.success) setComments(cm.comments ?? []);
    setLoading(false);
  }, [id, user?.dbId, user?.sessionToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.playing) watchedRef.current += 1;
    }, 1000);
    return () => {
      clearInterval(interval);
      if (!viewSentRef.current && user?.dbId && id && watchedRef.current > 2) {
        viewSentRef.current = true;
        void recordReelsView(Number(id), user.dbId, watchedRef.current, user.sessionToken);
      }
    };
  }, [player, id, user?.dbId, user?.sessionToken]);

  const toggleReaction = async (reaction: "like" | "dislike") => {
    if (!user?.dbId || !video) return;
    await reactReelsVideo(video.id, user.dbId, reaction, user.sessionToken);
    void load();
  };

  const toggleSubscribe = async () => {
    if (!user?.dbId || !video) return;
    if (subscribed) {
      await unsubscribeReelsChannel(video.channelId, user.dbId, user.sessionToken);
      setSubscribed(false);
    } else {
      await subscribeReelsChannel(video.channelId, user.dbId, user.sessionToken);
      setSubscribed(true);
    }
    void load();
  };

  const confirmDeleteVideo = () => {
    if (!user?.dbId || !video || !channel?.isOwner) return;
    Alert.alert(
      "Delete video permanently?",
      `"${video.title}" hamesha ke liye delete ho jayega. Undo nahi hoga.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const res = await deleteReelsVideo(video.id, user.dbId!, user.sessionToken);
              if (!res.success) {
                Alert.alert("Delete failed", res.message ?? "Phir se try karein.");
                return;
              }
              if (video.channelHandle) {
                router.replace({ pathname: "/reels/channel/[handle]", params: { handle: video.channelHandle } });
              } else {
                router.replace("/(tabs)/video");
              }
            })();
          },
        },
      ],
    );
  };

  const sendComment = async () => {
    if (!user?.dbId || !commentText.trim() || !id) return;
    await postReelsComment(Number(id), user.dbId, commentText.trim(), user.sessionToken);
    setCommentText("");
    const cm = await fetchReelsComments(Number(id), user.sessionToken);
    if (cm.success) setComments(cm.comments ?? []);
    if (video) setVideo({ ...video, commentCount: video.commentCount + 1 });
  };

  const shareVideo = async () => {
    if (!video || !user?.dbId) return;
    await shareReelsVideo(video.id, user.dbId, user.sessionToken);
    const msg = `${video.title}\n@${video.channelHandle}`;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(video.videoUrl, { dialogTitle: msg }).catch(() => {});
    } else {
      Alert.alert("Share", msg);
    }
  };

  const openRelated = (v: ReelsVideo) => {
    router.replace({ pathname: "/reels/watch/[id]", params: { id: String(v.id) } });
  };

  const channelLabel = useCallback(
    (v: ReelsVideo) => v.channelDisplayName ?? (v.channelHandle ? `@${v.channelHandle}` : "Channel"),
    [],
  );

  const descPreview = useMemo(() => {
    if (!video?.description) return "";
    const d = video.description.trim();
    if (d.length <= DESC_PREVIEW_LEN) return d;
    return `${d.slice(0, DESC_PREVIEW_LEN).trim()}…`;
  }, [video?.description]);

  const hasLongDesc = (video?.description?.trim().length ?? 0) > DESC_PREVIEW_LEN;

  const renderRelated = ({ item }: { item: ReelsVideo }) => (
    <TouchableOpacity style={styles.ytCard} onPress={() => openRelated(item)} activeOpacity={0.9}>
      <View style={styles.thumbWrap}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" recyclingKey={String(item.id)} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="videocam" size={36} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        {item.channelAvatarUrl ? (
          <Image source={{ uri: item.channelAvatarUrl }} style={styles.channelAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.channelAvatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 }}>
              {(item.channelHandle ?? "?")[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.infoText}>
          <Text style={[styles.ytTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.ytMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {channelLabel(item)} · {formatViewCount(item.viewCount)} views
            {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
          </Text>
        </View>
        <Ionicons name="ellipsis-vertical" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );

  if (loading || !video) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const displayChannel = video.channelDisplayName ?? `@${video.channelHandle}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.playerWrap}>
        {playAllowed ? (
          <VideoView style={styles.player} player={player} contentFit="contain" nativeControls />
        ) : (
          <View style={[styles.player, styles.blockedPlayer]}>
            <Ionicons name="shield-checkmark-outline" size={40} color="#fff" />
            <Text style={styles.blockedTitle}>
              {video.moderationStatus === "rejected" || video.status === "removed" ? "Video blocked" : "Under safety review"}
            </Text>
            <Text style={styles.blockedText}>
              {video.moderationReason ?? playBlockReasons.join(" · ") ?? "This video is not public yet."}
            </Text>
            {channel?.isOwner ? (
              <TouchableOpacity style={styles.deleteOwnBtn} onPress={confirmDeleteVideo}>
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.deleteOwnBtnText}>Delete video</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <TouchableOpacity
          style={[styles.playerBack, { top: insets.top + 6 }]}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={related}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderRelated}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={[styles.vTitle, { color: colors.foreground }]}>{video.title}</Text>

            <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
              {formatViewCount(video.viewCount)} views
              {video.createdAt ? ` · ${formatTimeAgo(video.createdAt)}` : ""}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionScroll} contentContainerStyle={styles.actionRow}>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => video.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: video.channelHandle } })}
              >
                {video.channelAvatarUrl ? (
                  <Image source={{ uri: video.channelAvatarUrl }} style={styles.chipAvatar} />
                ) : (
                  <View style={[styles.chipAvatar, { backgroundColor: colors.primary }]} />
                )}
                <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
                  {displayChannel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.chip,
                  subscribed
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.background, borderColor: colors.foreground },
                ]}
                onPress={toggleSubscribe}
              >
                <Ionicons
                  name={subscribed ? "notifications" : "notifications-outline"}
                  size={16}
                  color={subscribed ? "#fff" : colors.foreground}
                />
                <Text style={[styles.chipText, { color: subscribed ? "#fff" : colors.foreground }]}>
                  {subscribed ? "Subscribed" : "Subscribe"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => toggleReaction("like")}>
                <Ionicons
                  name={video.myReaction === "like" ? "thumbs-up" : "thumbs-up-outline"}
                  size={16}
                  color={video.myReaction === "like" ? colors.primary : colors.foreground}
                />
                <Text style={[styles.chipText, { color: colors.foreground }]}>{formatViewCount(video.likeCount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => toggleReaction("dislike")}>
                <Ionicons
                  name={video.myReaction === "dislike" ? "thumbs-down" : "thumbs-down-outline"}
                  size={16}
                  color={colors.foreground}
                />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={shareVideo}>
                <Ionicons name="share-outline" size={16} color={colors.foreground} />
                <Text style={[styles.chipText, { color: colors.foreground }]}>Share</Text>
              </TouchableOpacity>

              {channel?.isOwner ? (
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: colors.card, borderColor: "#e53935" }]}
                  onPress={confirmDeleteVideo}
                >
                  <Ionicons name="trash-outline" size={16} color="#e53935" />
                  <Text style={[styles.chipText, { color: "#e53935" }]}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>

            {video.description ? (
              <TouchableOpacity style={styles.descPreview} onPress={() => setDescOpen(true)} activeOpacity={0.8}>
                <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
                  {descPreview}
                  {hasLongDesc ? (
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}> more</Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.commentsBar, { borderColor: colors.border }]}
              onPress={() => setCommentsOpen(true)}
            >
              <Text style={[styles.commentsBarTitle, { color: colors.foreground }]}>Comments</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
                {formatViewCount(video.commentCount)}
              </Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Description bottom sheet (YouTube-style) */}
      <Modal visible={descOpen} transparent animationType="slide" onRequestClose={() => setDescOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetScrim} onPress={() => setDescOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Description</Text>
              <TouchableOpacity onPress={() => setDescOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={26} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              <Text style={[styles.sheetVideoTitle, { color: colors.foreground }]}>{video.title}</Text>

              <View style={styles.statTiles}>
                <View style={[styles.statTile, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>{formatViewCount(video.likeCount)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Likes</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>{formatViewCount(video.viewCount)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Views</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>{formatTimeAgo(video.createdAt)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Uploaded</Text>
                </View>
              </View>

              {channel ? (
                <TouchableOpacity
                  style={[styles.sheetChannel, { borderColor: colors.border }]}
                  onPress={() => {
                    setDescOpen(false);
                    video.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: video.channelHandle } });
                  }}
                >
                  {channel.avatarUrl ? (
                    <Image source={{ uri: channel.avatarUrl }} style={styles.sheetChannelAvatar} />
                  ) : (
                    <View style={[styles.sheetChannelAvatar, { backgroundColor: colors.primary }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 15 }}>
                      {channel.displayName ?? `@${channel.handle}`}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                      {formatViewCount(channel.subscriberCount)} subscribers
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.sheetSubBtn,
                      subscribed
                        ? { backgroundColor: colors.primary, borderWidth: 0 }
                        : { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.foreground },
                    ]}
                    onPress={toggleSubscribe}
                  >
                    <Text
                      style={{
                        color: subscribed ? "#fff" : colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 13,
                      }}
                    >
                      {subscribed ? "Subscribed" : "Subscribe"}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ) : null}

              <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22, marginTop: 16 }}>
                {video.description}
              </Text>

              {video.hashtags && video.hashtags.length > 0 ? (
                <Text style={{ color: colors.primary, marginTop: 12, fontSize: 14 }}>
                  {video.hashtags.map((t) => `#${t}`).join(" ")}
                </Text>
              ) : null}

              <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, marginLeft: 12 }}>{formatUploadDate(video.createdAt)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="eye-outline" size={18} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, marginLeft: 12 }}>{formatViewCount(video.viewCount)} views</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="thumbs-up-outline" size={18} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, marginLeft: 12 }}>{formatViewCount(video.likeCount)} likes</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Comments bottom sheet */}
      <DismissibleModal visible={commentsOpen} onClose={() => setCommentsOpen(false)} animationType="slide">
        <View style={styles.sheetRoot}>
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 8, marginTop: "auto" }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentsOpen(false)}>
                <Ionicons name="close" size={26} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.commentInputRow, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.commentInput, { color: colors.foreground }]}
                placeholder="Add a comment..."
                placeholderTextColor={colors.mutedForeground}
                value={commentText}
                onChangeText={setCommentText}
              />
              <TouchableOpacity onPress={sendComment} disabled={!commentText.trim()}>
                <Ionicons name="send" size={22} color={commentText.trim() ? colors.primary : colors.muted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={comments}
              keyExtractor={(c) => String(c.id)}
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 24 }}>No comments yet</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{item.displayName}</Text>
                  <Text style={{ color: colors.foreground, marginTop: 2 }}>{item.content}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                    {formatTimeAgo(item.createdAt)}
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      </DismissibleModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  playerWrap: { position: "relative", backgroundColor: "#000" },
  player: { width: "100%", aspectRatio: 16 / 9 },
  playerBack: {
    position: "absolute",
    left: 10,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
  },
  blockedPlayer: { alignItems: "center", justifyContent: "center", padding: 20 },
  blockedTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 12 },
  blockedText: { color: "#ccc", textAlign: "center", marginTop: 8, fontSize: 13 },
  deleteOwnBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  deleteOwnBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  headerBlock: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  vTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  metaLine: { fontSize: 13, marginTop: 6 },
  actionScroll: { marginTop: 12 },
  actionRow: { flexDirection: "row", gap: 8, paddingRight: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipAvatar: { width: 24, height: 24, borderRadius: 12 },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  descPreview: { marginTop: 12, paddingVertical: 4 },
  commentsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentsBarTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  ytCard: { marginBottom: 16 },
  thumbWrap: { position: "relative" },
  thumb: { width: SCREEN_W, height: THUMB_H },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
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
  channelAvatar: { width: 36, height: 36, borderRadius: 18 },
  infoText: { flex: 1 },
  ytTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  ytMeta: { fontSize: 12, marginTop: 4 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetVideoTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22, marginBottom: 14 },
  statTiles: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statTile: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center" },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  sheetChannel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sheetChannelAvatar: { width: 44, height: 44, borderRadius: 22 },
  sheetSubBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  commentInput: { flex: 1, fontSize: 15 },
  commentItem: { marginBottom: 16 },
});
