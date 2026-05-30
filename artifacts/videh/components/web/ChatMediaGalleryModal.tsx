import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import { fetchChatSharedMedia, type SharedMediaItem, type SharedMediaBuckets } from "@/lib/chatSharedMedia";
import { getDocumentVisual } from "@/lib/documentMessage";
import { extensionFromFilename } from "@/lib/normalizeMessage";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { downloadUrlToDevice } from "@/lib/web/webDownload";
import { formatTime } from "@/utils/time";

type TabId = "media" | "docs" | "links";

type Props = {
  visible: boolean;
  chatId: string;
  chatName?: string;
  onClose: () => void;
  initialTab?: TabId;
};

export function ChatMediaGalleryModal({
  visible,
  chatId,
  chatName,
  onClose,
  initialTab = "media",
}: Props) {
  const colors = useColors();
  const router = useRouter();
  const { user } = useApp();
  const { width } = useWindowDimensions();
  const cols = width > 1200 ? 5 : width > 800 ? 4 : 3;

  const [tab, setTab] = useState<TabId>(initialTab);
  const [loading, setLoading] = useState(false);
  const [buckets, setBuckets] = useState<SharedMediaBuckets>({ media: [], docs: [], links: [] });

  useEffect(() => {
    if (!visible || !chatId || !user?.dbId) return;
    setTab(initialTab);
    setLoading(true);
    void fetchChatSharedMedia(chatId, user.dbId, user.sessionToken)
      .then(setBuckets)
      .finally(() => setLoading(false));
  }, [visible, chatId, user?.dbId, user?.sessionToken, initialTab]);

  const items = useMemo(() => {
    if (tab === "media") return buckets.media;
    if (tab === "docs") return buckets.docs;
    return buckets.links;
  }, [tab, buckets]);

  const totalCount = buckets.media.length + buckets.docs.length + buckets.links.length;

  const openItem = useCallback(
    (item: SharedMediaItem) => {
      if (item.kind === "link") {
        void Linking.openURL(item.content);
        return;
      }
      if (!item.mediaUrl) return;
      if (item.kind === "video") {
        onClose();
        router.push({
          pathname: "/chat/video-viewer",
          params: {
            remoteUri: encodeURIComponent(item.mediaUrl),
            senderLabel: chatName ?? "Video",
          },
        } as never);
        return;
      }
      if (item.kind === "image") {
        const url = resolvePublicAssetUrl(item.mediaUrl) ?? item.mediaUrl;
        void Linking.openURL(url);
        return;
      }
      const url = resolvePublicAssetUrl(item.mediaUrl) ?? item.mediaUrl;
      void downloadUrlToDevice(url, item.content || "document", authFetchHeaders(user?.sessionToken));
    },
    [chatName, onClose, router, user?.sessionToken],
  );

  const renderItem = ({ item }: { item: SharedMediaItem }) => {
    if (item.kind === "link") {
      return (
        <TouchableOpacity
          style={[styles.linkCell, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => openItem(item)}
          activeOpacity={0.85}
        >
          <Ionicons name="link" size={22} color={colors.primary} />
          <Text style={[styles.linkTxt, { color: colors.foreground }]} numberOfLines={3}>
            {item.content}
          </Text>
          <Text style={[styles.linkTime, { color: colors.mutedForeground }]}>{formatTime(item.timestamp)}</Text>
        </TouchableOpacity>
      );
    }

    if (item.kind === "document") {
      const visual = getDocumentVisual(item.content);
      const ext = extensionFromFilename(item.content).toUpperCase();
      return (
        <TouchableOpacity
          style={[styles.docCell, { backgroundColor: colors.isDark ? "#233138" : "#F0F2F5" }]}
          onPress={() => openItem(item)}
          activeOpacity={0.85}
        >
          <View style={[styles.docIcon, { backgroundColor: visual.iconBg }]}>
            <Ionicons name={visual.icon} size={22} color={visual.iconColor} />
          </View>
          <Text style={[styles.docName, { color: colors.foreground }]} numberOfLines={2}>
            {item.content}
          </Text>
          <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>{ext} · Document</Text>
        </TouchableOpacity>
      );
    }

    const uri = item.mediaUrl ? resolvePublicAssetUrl(item.mediaUrl) : undefined;
    return (
      <TouchableOpacity style={styles.mediaCell} onPress={() => openItem(item)} activeOpacity={0.88}>
        {uri && item.kind === "image" ? (
          <Image
            source={{ uri, headers: authFetchHeaders(user?.sessionToken) as Record<string, string> }}
            style={styles.mediaImg}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.mediaImg, styles.videoPh, { backgroundColor: colors.isDark ? "#1a2630" : "#cfd4d8" }]}>
            <Ionicons name="videocam" size={28} color="#fff" />
          </View>
        )}
        <View style={styles.mediaOverlay}>
          <Text style={styles.mediaSender} numberOfLines={1}>
            {item.senderName ?? " "}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)" }]}>
        <View style={[styles.sheet, { backgroundColor: colors.isDark ? "#111B21" : colors.background }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={styles.topCenter}>
              <Text style={[styles.topTitle, { color: colors.foreground }]}>
                {tab === "media" ? "Media" : tab === "docs" ? "Docs" : "Links"}
              </Text>
              <Text style={[styles.topSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {chatName ? `${chatName} · ${totalCount} items` : `${totalCount} items`}
              </Text>
            </View>
            <View style={{ width: 24 }} />
          </View>

          <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
            {(
              [
                { id: "media" as const, label: "Media", count: buckets.media.length },
                { id: "docs" as const, label: "Docs", count: buckets.docs.length },
                { id: "links" as const, label: "Links", count: buckets.links.length },
              ] as const
            ).map((t) => (
              <Pressable key={t.id} style={styles.tabBtn} onPress={() => setTab(t.id)}>
                <Text style={[styles.tabTxt, { color: tab === t.id ? colors.primary : colors.mutedForeground }]}>
                  {t.label}
                  {t.count > 0 ? `  ${t.count}` : ""}
                </Text>
                {tab === t.id ? <View style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
              </Pressable>
            ))}
          </View>

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.loader}>
              <Ionicons name="folder-open-outline" size={48} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>No items in this tab</Text>
            </View>
          ) : tab === "links" ? (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              renderItem={renderItem}
              contentContainerStyle={styles.linkList}
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              numColumns={cols}
              key={`cols-${cols}-${tab}`}
              renderItem={renderItem}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={tab !== "links" ? styles.gridRow : undefined}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: {
    width: "100%",
    maxWidth: 1100,
    height: "92%",
    borderRadius: 12,
    overflow: "hidden",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topCenter: { flex: 1, alignItems: "center" },
  topTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  topSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12, position: "relative" },
  tabTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabLine: { position: "absolute", bottom: 0, height: 2, width: "60%", borderRadius: 1 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: { padding: 4 },
  gridRow: { gap: 4 },
  mediaCell: { flex: 1, aspectRatio: 1, margin: 2, borderRadius: 4, overflow: "hidden" },
  mediaImg: { width: "100%", height: "100%" },
  videoPh: { alignItems: "center", justifyContent: "center" },
  mediaOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  mediaSender: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  docCell: {
    flex: 1,
    margin: 2,
    minHeight: 120,
    borderRadius: 6,
    padding: 10,
    justifyContent: "flex-end",
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  docName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  linkList: { padding: 12, gap: 8 },
  linkCell: {
    padding: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  linkTxt: { fontSize: 14, fontFamily: "Inter_400Regular" },
  linkTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
