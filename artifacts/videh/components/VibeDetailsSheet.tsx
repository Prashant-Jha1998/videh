import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { DismissibleModal } from "@/components/DismissibleModal";
import { formatTimeAgo, type ReelsVideo } from "@/lib/reelsApi";
import type { VideoEditorMetadata } from "@/lib/videoEditor";

type Props = {
  visible: boolean;
  onClose: () => void;
  video: ReelsVideo;
  editorMeta?: VideoEditorMetadata | null;
  subscribed: boolean;
  onFollow: () => void;
  onOpenChannel: () => void;
  onReport?: () => void;
};

export function VibeDetailsSheet({
  visible,
  onClose,
  video,
  editorMeta,
  subscribed,
  onFollow,
  onOpenChannel,
  onReport,
}: Props) {
  const handle = video.channelHandle ? `@${video.channelHandle}` : (video.channelDisplayName ?? "Channel");
  const title = video.title?.trim() || "Untitled";
  const caption = editorMeta?.caption?.trim();
  const description = video.description?.trim();
  const body = description || caption || "";
  const tags = (video.hashtags ?? []).filter(Boolean);

  return (
    <DismissibleModal visible={visible} onClose={onClose} animationType="slide" backdropOpacity={0.2}>
      <View style={styles.root}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>About this clip</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.authorRow} onPress={onOpenChannel} activeOpacity={0.85}>
              {video.channelAvatarUrl ? (
                <Image source={{ uri: video.channelAvatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={18} color="#fff" />
                </View>
              )}
              <Text style={styles.userHandle} numberOfLines={1}>{handle}</Text>
              <TouchableOpacity
                style={[styles.connectBtn, subscribed && styles.connectBtnDone]}
                onPress={onFollow}
              >
                <Text style={[styles.connectText, subscribed && styles.connectTextDone]}>
                  {subscribed ? "Connected" : "Connect"}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>

            <Text style={styles.title}>{title}</Text>

            {body ? (
              <Text style={styles.body}>{body}</Text>
            ) : (
              <Text style={styles.muted}>No description</Text>
            )}

            {tags.length > 0 ? (
              <View style={styles.tagsWrap}>
                {tags.map((tag) => (
                  <Text key={tag} style={styles.tag}>#{tag.replace(/^#/, "")}</Text>
                ))}
              </View>
            ) : null}

            {video.createdAt ? (
              <Text style={styles.time}>{formatTimeAgo(video.createdAt)}</Text>
            ) : null}

            {onReport ? (
              <TouchableOpacity style={styles.reportBtn} onPress={onReport} activeOpacity={0.85}>
                <Ionicons name="flag-outline" size={18} color="#FF6B6B" />
                <Text style={styles.reportText}>Report this Vibe</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </DismissibleModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#141414",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "62%",
    minHeight: 240,
    paddingBottom: 16,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: "#fff" },
  avatarPlaceholder: { backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  userHandle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  connectBtn: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  connectBtnDone: { borderColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.1)" },
  connectText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  connectTextDone: { color: "rgba(255,255,255,0.85)" },
  title: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  body: { color: "rgba(255,255,255,0.92)", fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  muted: { color: "rgba(255,255,255,0.45)", fontSize: 14 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  tag: { color: "#7dd3fc", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  time: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 6, fontFamily: "Inter_400Regular" },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  reportText: { color: "#FF6B6B", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
