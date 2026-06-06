import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  fetchReelsChannel,
  fetchReelsComments,
  fetchReelsVideo,
  formatViewCount,
  postReelsComment,
  reactReelsVideo,
  recordReelsView,
  shareReelsVideo,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsVideo,
} from "@/lib/reelsApi";

export default function ReelsWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [video, setVideo] = useState<ReelsVideo | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [comments, setComments] = useState<{ id: number; content: string; displayName: string; createdAt: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [playAllowed, setPlayAllowed] = useState(true);
  const [playBlockReasons, setPlayBlockReasons] = useState<string[]>([]);
  const watchedRef = useRef(0);
  const viewSentRef = useRef(false);

  const player = useVideoPlayer(video?.videoUrl ?? null, (p) => {
    p.loop = false;
    p.play();
  });

  useEvent(player, "statusChange", { status: player.status });

  const load = useCallback(async () => {
    if (!user?.dbId || !id) return;
    const res = await fetchReelsVideo(Number(id), user.dbId, user.sessionToken);
    if (res.success && res.video) {
      setVideo(res.video);
      setPlayAllowed(res.playAllowed !== false);
      setPlayBlockReasons(res.playBlockReasons ?? []);
      if (res.video.channelHandle) {
        const ch = await fetchReelsChannel(res.video.channelHandle, user.dbId, user.sessionToken);
        setSubscribed(Boolean(ch.channel?.isSubscribed));
      }
    }
    const cm = await fetchReelsComments(Number(id), user.sessionToken);
    if (cm.success) setComments(cm.comments ?? []);
    setLoading(false);
  }, [id, user?.dbId, user?.sessionToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (player.playing) {
        watchedRef.current += 1;
      }
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
  };

  const sendComment = async () => {
    if (!user?.dbId || !commentText.trim() || !id) return;
    await postReelsComment(Number(id), user.dbId, commentText.trim(), user.sessionToken);
    setCommentText("");
    void load();
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

  if (loading || !video) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {playAllowed ? (
        <VideoView style={styles.player} player={player} contentFit="contain" nativeControls />
      ) : (
        <View style={[styles.player, styles.blockedPlayer]}>
          <Ionicons name="shield-checkmark-outline" size={40} color="#fff" />
          <Text style={styles.blockedTitle}>
            {video.moderationStatus === "rejected" || video.status === "removed"
              ? "Video blocked"
              : "Under safety review"}
          </Text>
          <Text style={styles.blockedText}>
            {video.moderationReason
              ?? playBlockReasons.join(" · ")
              ?? "This video is not public yet."}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.vTitle, { color: colors.foreground }]}>{video.title}</Text>
        <TouchableOpacity
          onPress={() => video.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: video.channelHandle } })}
        >
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>@{video.channelHandle}</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.mutedForeground, marginTop: 4 }}>
          {formatViewCount(video.viewCount)} views · 👍 {video.likeCount} · 👎 {video.dislikeCount} · 💬 {video.commentCount}
        </Text>
        {video.description ? (
          <Text style={{ color: colors.foreground, marginTop: 8 }}>{video.description}</Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actBtn} onPress={() => toggleReaction("like")}>
            <Ionicons name={video.myReaction === "like" ? "thumbs-up" : "thumbs-up-outline"} size={22} color={colors.primary} />
            <Text style={{ color: colors.foreground }}>Like</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={() => toggleReaction("dislike")}>
            <Ionicons name={video.myReaction === "dislike" ? "thumbs-down" : "thumbs-down-outline"} size={22} color={colors.foreground} />
            <Text style={{ color: colors.foreground }}>Dislike</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={toggleSubscribe}>
            <Ionicons name={subscribed ? "notifications" : "notifications-outline"} size={22} color={colors.primary} />
            <Text style={{ color: colors.foreground }}>{subscribed ? "Subscribed" : "Subscribe"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={shareVideo}>
            <Ionicons name="share-outline" size={22} color={colors.foreground} />
            <Text style={{ color: colors.foreground }}>Share</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.foreground }]}>Comments</Text>
        <View style={styles.commentRow}>
          <TextInput
            style={[styles.commentInput, { color: colors.foreground, borderColor: colors.border }]}
            placeholder="Add a comment..."
            placeholderTextColor={colors.mutedForeground}
            value={commentText}
            onChangeText={setCommentText}
          />
          <TouchableOpacity onPress={sendComment}>
            <Ionicons name="send" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={comments}
          keyExtractor={(c) => String(c.id)}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{item.displayName}</Text>
              <Text style={{ color: colors.foreground }}>{item.content}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { paddingHorizontal: 12, paddingBottom: 4 },
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  blockedPlayer: { alignItems: "center", justifyContent: "center", padding: 20 },
  blockedTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 12 },
  blockedText: { color: "#ccc", textAlign: "center", marginTop: 8, fontSize: 13 },
  body: { padding: 16, paddingBottom: 40 },
  vTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 16, marginBottom: 16 },
  actBtn: { alignItems: "center", gap: 4, minWidth: 64 },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginBottom: 8 },
  commentRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  commentInput: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  commentItem: { marginBottom: 12 },
});
