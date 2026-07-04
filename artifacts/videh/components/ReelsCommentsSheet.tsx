import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DismissibleModal } from "@/components/DismissibleModal";
import { useColors } from "@/hooks/useColors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import {
  fetchReelsCommentReplies,
  fetchReelsComments,
  formatTimeAgo,
  formatViewCount,
  postReelsComment,
  reactReelsComment,
  type ReelsComment,
  type ReelsCommentSort,
} from "@/lib/reelsApi";

type Props = {
  visible: boolean;
  onClose: () => void;
  videoId: number;
  commentCount: number;
  userId: number;
  sessionToken?: string | null;
  userAvatarUrl?: string | null;
  onCommentPosted?: () => void;
  /** Vibe feed uses same light sheet; shows channel caption preview. */
  variant?: "watch" | "vibe";
  channelLabel?: string | null;
  captionPreview?: string | null;
};

function ytTimeAgo(iso: string): string {
  const raw = formatTimeAgo(iso);
  return raw
    .replace(/^(\d+)m ago$/, "$1 min ago")
    .replace(/^(\d+)h ago$/, "$1 hr ago")
    .replace(/^(\d+)d ago$/, "$1 day ago")
    .replace(/^(\d+)w ago$/, "$1 wk ago");
}

function CommentAvatar({
  uri,
  size,
  fallbackColor,
  label,
}: {
  uri?: string | null;
  size: number;
  fallbackColor: string;
  label: string;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fallbackColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: size * 0.38 }}>
        {label.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function ReelsCommentsSheet({
  visible,
  onClose,
  videoId,
  commentCount,
  userId,
  sessionToken,
  userAvatarUrl,
  onCommentPosted,
  variant = "watch",
  channelLabel,
  captionPreview,
}: Props) {
  const colors = useColors();
  const { t } = useUiPreferences();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isVibe = variant === "vibe";
  const sheetHeight = Math.round(windowHeight * (isVibe ? 0.68 : 0.78));
  const sheetBg = colors.background;
  const fg = colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;
  const inputBg = colors.muted;
  const chipBg = colors.card;
  const chipActiveBg = colors.foreground;
  const chipActiveFg = colors.background;
  const [comments, setComments] = useState<ReelsComment[]>([]);
  const [sort, setSort] = useState<ReelsCommentSort>("top");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReelsComment | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [repliesMap, setRepliesMap] = useState<Record<number, ReelsComment[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Set<number>>(new Set());
  const inputRef = useRef<TextInput>(null);

  const loadComments = useCallback(async () => {
    if (!videoId || !userId) return;
    setLoading(true);
    const res = await fetchReelsComments(videoId, userId, sort, sessionToken);
    if (res.success) setComments(res.comments ?? []);
    setLoading(false);
  }, [videoId, userId, sort, sessionToken]);

  useEffect(() => {
    if (!visible) return;
    void loadComments();
  }, [visible, loadComments]);

  const loadReplies = useCallback(async (commentId: number) => {
    if (loadingReplies.has(commentId) || repliesMap[commentId]) return;
    setLoadingReplies((prev) => new Set(prev).add(commentId));
    const res = await fetchReelsCommentReplies(videoId, commentId, userId, sessionToken);
    if (res.success) {
      setRepliesMap((prev) => ({ ...prev, [commentId]: res.replies ?? [] }));
    }
    setLoadingReplies((prev) => {
      const next = new Set(prev);
      next.delete(commentId);
      return next;
    });
  }, [videoId, userId, sessionToken, loadingReplies, repliesMap]);

  const toggleReplies = useCallback((comment: ReelsComment) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(comment.id)) {
        next.delete(comment.id);
      } else {
        next.add(comment.id);
        void loadReplies(comment.id);
      }
      return next;
    });
  }, [loadReplies]);

  const handleReact = async (comment: ReelsComment, reaction: "like" | "dislike") => {
    const res = await reactReelsComment(comment.id, userId, reaction, sessionToken);
    if (!res.success) return;
    const patch = (c: ReelsComment): ReelsComment => {
      if (c.id !== comment.id) return c;
      const wasLike = c.myReaction === "like";
      const nextReaction = res.reaction as "like" | "dislike" | null;
      let likeCount = c.likeCount;
      if (wasLike && nextReaction !== "like") likeCount = Math.max(0, likeCount - 1);
      if (!wasLike && nextReaction === "like") likeCount += 1;
      return { ...c, myReaction: nextReaction, likeCount };
    };
    setComments((prev) => prev.map(patch));
    setRepliesMap((prev) => {
      const out = { ...prev };
      for (const key of Object.keys(out)) {
        out[Number(key)] = out[Number(key)].map(patch);
      }
      return out;
    });
  };

  const sendComment = async () => {
    const text = commentText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await postReelsComment(
        videoId,
        userId,
        text,
        sessionToken,
        replyTarget?.id ?? null,
      );
      setCommentText("");
      const parentId = replyTarget?.parentId ?? replyTarget?.id ?? null;
      setReplyTarget(null);
      await loadComments();
      if (parentId) {
        setRepliesMap((prev) => {
          const next = { ...prev };
          delete next[parentId];
          return next;
        });
        if (expandedIds.has(parentId)) {
          void loadReplies(parentId);
        }
      }
      if (parentId) {
        setComments((prev) => prev.map((c) => (
          c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c
        )));
      }
      onCommentPosted?.();
    } catch {
      Alert.alert(t("common.error"), t("reels.commentFailed"));
    } finally {
      setSending(false);
    }
  };

  const startReply = (comment: ReelsComment) => {
    setReplyTarget(comment);
    inputRef.current?.focus();
  };

  const renderActions = (item: ReelsComment, compact = false) => (
    <View style={[styles.actions, compact && styles.actionsCompact]}>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => void handleReact(item, "like")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={item.myReaction === "like" ? "thumbs-up" : "thumbs-up-outline"}
          size={compact ? 16 : 18}
          color={item.myReaction === "like" ? colors.primary : muted}
        />
        {item.likeCount > 0 ? (
          <Text style={[styles.actionCount, { color: muted }]}>
            {formatViewCount(item.likeCount)}
          </Text>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => void handleReact(item, "dislike")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={item.myReaction === "dislike" ? "thumbs-down" : "thumbs-down-outline"}
          size={compact ? 16 : 18}
          color={item.myReaction === "dislike" ? colors.primary : muted}
        />
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn} onPress={() => startReply(item)}>
        {compact ? (
          <Text style={[styles.replyLink, { color: muted }]}>Reply</Text>
        ) : (
          <Ionicons name="chatbubble-outline" size={18} color={muted} />
        )}
      </TouchableOpacity>
    </View>
  );

  const renderCommentBody = (item: ReelsComment, nested = false) => {
    const handle = item.channelHandle ? `@${item.channelHandle}` : item.displayName;
    return (
      <View style={[styles.commentRow, nested && styles.replyRow]}>
        <CommentAvatar
          uri={item.avatarUrl}
          size={nested ? 28 : 36}
          fallbackColor={colors.primary}
          label={item.displayName}
        />
        <View style={styles.commentBody}>
          <View style={styles.metaRow}>
            <Text style={[styles.handle, { color: fg }]} numberOfLines={1}>
              {handle}
            </Text>
            <Text style={[styles.dot, { color: muted }]}> · </Text>
            <Text style={[styles.time, { color: muted }]}>
              {ytTimeAgo(item.createdAt)}
            </Text>
          </View>
          <Text style={[styles.commentText, { color: fg }]}>{item.content}</Text>
          {renderActions(item, nested)}
        </View>
      </View>
    );
  };

  const renderReplyToggle = (item: ReelsComment) => {
    if (item.replyCount <= 0) return null;
    const expanded = expandedIds.has(item.id);
    const label = item.replyCount === 1 ? "1 reply" : `${formatViewCount(item.replyCount)} replies`;
    return (
      <TouchableOpacity
        style={styles.replyToggle}
        onPress={() => toggleReplies(item)}
        activeOpacity={0.7}
      >
        <View style={styles.replyConnector}>
          <View style={[styles.replyLineV, { backgroundColor: colors.border }]} />
          <View style={[styles.replyLineH, { backgroundColor: colors.border }]} />
        </View>
        <Text style={[styles.replyToggleText, { color: colors.primary }]}>
          {expanded ? "Hide replies" : `${label} ›`}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderReplies = (parentId: number) => {
    if (!expandedIds.has(parentId)) return null;
    if (loadingReplies.has(parentId)) {
      return (
        <View style={styles.repliesLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    const replies = repliesMap[parentId] ?? [];
    return (
      <View style={styles.repliesBlock}>
        {replies.map((reply) => (
          <View key={reply.id}>
            {renderCommentBody(reply, true)}
          </View>
        ))}
      </View>
    );
  };

  const inputBar = (
    <>
      {replyTarget ? (
        <View style={[styles.replyBanner, { backgroundColor: inputBg, borderColor: border }]}>
          <Text style={{ color: muted, flex: 1 }} numberOfLines={1}>
            Replying to {replyTarget.channelHandle ? `@${replyTarget.channelHandle}` : replyTarget.displayName}
          </Text>
          <TouchableOpacity onPress={() => setReplyTarget(null)}>
            <Ionicons name="close-circle" size={20} color={muted} />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={[styles.inputBar, { borderTopColor: border, backgroundColor: sheetBg }]}>
        <CommentAvatar
          uri={userAvatarUrl}
          size={32}
          fallbackColor={colors.primary}
          label="You"
        />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: fg, backgroundColor: inputBg }]}
          placeholder={
            isVibe && channelLabel
              ? `Add a comment for ${channelLabel}...`
              : (replyTarget ? "Add a reply..." : "Add a comment...")
          }
          placeholderTextColor={muted}
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <TouchableOpacity onPress={() => void sendComment()} disabled={!commentText.trim() || sending}>
          {sending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="send" size={22} color={commentText.trim() ? colors.primary : muted} />
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <DismissibleModal
      visible={visible}
      onClose={onClose}
      animationType="slide"
      backdropOpacity={0.45}
    >
      <View style={styles.sheetRoot}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 8 : 0),
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: fg }]}>
              Comments{commentCount > 0 ? ` · ${formatViewCount(commentCount)}` : ""}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={26} color={fg} />
            </TouchableOpacity>
          </View>

          {isVibe && channelLabel && !captionPreview ? (
            <View style={[styles.vibePreview, { borderBottomColor: border }]}>
              <Text style={[styles.vibePreviewUser, { color: fg }]} numberOfLines={1}>{channelLabel}</Text>
            </View>
          ) : null}
          {isVibe && captionPreview ? (
            <View style={[styles.vibePreview, { borderBottomColor: border }]}>
              {channelLabel ? (
                <Text style={[styles.vibePreviewUser, { color: fg }]} numberOfLines={1}>{channelLabel}</Text>
              ) : null}
              <Text style={[styles.vibePreviewCaption, { color: muted }]} numberOfLines={2}>{captionPreview}</Text>
            </View>
          ) : null}

          {!isVibe ? (
            <View style={styles.sortRow}>
              {(["top", "newest"] as ReelsCommentSort[]).map((s) => {
                const active = sort === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: active ? chipActiveBg : chipBg,
                        borderColor: border,
                      },
                    ]}
                    onPress={() => setSort(s)}
                  >
                    <Text
                      style={{
                        color: active ? chipActiveFg : fg,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 13,
                      }}
                    >
                      {s === "top" ? "Top" : "Newest"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <View style={styles.listWrap}>
            {loading ? (
              <ActivityIndicator style={styles.listLoader} color={colors.primary} />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => String(c.id)}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Text style={{ color: muted, textAlign: "center" }}>
                      No comments yet
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={styles.commentBlock}>
                    {renderCommentBody(item)}
                    {renderReplyToggle(item)}
                    {renderReplies(item.id)}
                  </View>
                )}
              />
            )}
          </View>

          <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
            {inputBar}
          </KeyboardStickyView>
        </View>
      </View>
    </DismissibleModal>
  );
}

const styles = StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    overflow: "hidden",
  },
  vibePreview: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  vibePreviewUser: { fontFamily: "Inter_700Bold", fontSize: 14 },
  vibePreviewCaption: { fontSize: 13, lineHeight: 18 },
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
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sortRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  listWrap: { flex: 1, minHeight: 0 },
  listLoader: { marginVertical: 24 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 8, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32 },
  commentBlock: { marginBottom: 18 },
  commentRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  replyRow: { marginLeft: 48, marginTop: 12 },
  commentBody: { flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  handle: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  dot: { fontSize: 13 },
  time: { fontSize: 12 },
  commentText: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
  actionsCompact: { gap: 12 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyLink: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginLeft: 48,
    paddingVertical: 6,
  },
  replyConnector: { width: 24, height: 20, marginRight: 4 },
  replyLineV: { position: "absolute", left: 0, top: 0, width: 2, height: 12, borderRadius: 1 },
  replyLineH: { position: "absolute", left: 0, top: 10, width: 16, height: 2, borderRadius: 1 },
  replyToggleText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  repliesBlock: { marginTop: 4 },
  repliesLoading: { marginLeft: 48, paddingVertical: 8 },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 42,
    maxHeight: 100,
  },
});
