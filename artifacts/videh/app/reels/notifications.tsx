import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SectionList,
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
import {
  fetchReelsVideoNotifications,
  formatTimeAgo,
  hideReelsVideoNotification,
  markReelsVideoNotificationsRead,
  type ReelsVideoNotification,
} from "@/lib/reelsApi";

type GroupedNotification = {
  key: string;
  channelId: number;
  channelLabel: string;
  channelHandle: string | null;
  channelAvatarUrl: string | null;
  items: ReelsVideoNotification[];
  latestVideoId: number;
  thumbnailUrl: string | null;
  createdAt: string;
  unread: boolean;
};

function channelLabel(n: ReelsVideoNotification): string {
  if (n.actorLabel?.trim()) return n.actorLabel.trim();
  return n.channelDisplayName ?? (n.channelHandle ? `@${n.channelHandle}` : "Channel");
}

function notificationSummary(n: ReelsVideoNotification): string {
  const actor = n.actorLabel?.trim() || "Someone";
  switch (n.kind) {
    case "video_like":
      return `${actor} liked your video`;
    case "video_comment":
      return n.detailText?.trim()
        ? `${actor} commented: ${n.detailText.trim()}`
        : `${actor} commented on your video`;
    case "video_share":
      return `${actor} shared your video`;
    case "channel_connect":
      return `${actor} connected with your channel`;
    case "new_video":
    default:
      return n.videoTitle?.trim() || "New video";
  }
}

function groupNotifications(list: ReelsVideoNotification[]): GroupedNotification[] {
  const sorted = [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const result: GroupedNotification[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  let i = 0;

  while (i < sorted.length) {
    const first = sorted[i];
    const isUploadBatch = first.kind === "new_video";

    if (!isUploadBatch) {
      result.push({
        key: String(first.id),
        channelId: first.channelId,
        channelLabel: channelLabel(first),
        channelHandle: first.channelHandle,
        channelAvatarUrl: first.channelAvatarUrl,
        items: [first],
        latestVideoId: first.videoId,
        thumbnailUrl: first.thumbnailUrl,
        createdAt: first.createdAt,
        unread: !first.read,
      });
      i += 1;
      continue;
    }

    const batch: ReelsVideoNotification[] = [first];
    let j = i + 1;
    while (j < sorted.length && sorted[j].kind === "new_video" && sorted[j].channelId === first.channelId) {
      const newer = new Date(sorted[j - 1].createdAt).getTime();
      const older = new Date(sorted[j].createdAt).getTime();
      if (newer - older > dayMs) break;
      batch.push(sorted[j]);
      j += 1;
    }

    result.push({
      key: batch.map((n) => n.id).join("-"),
      channelId: first.channelId,
      channelLabel: channelLabel(first),
      channelHandle: first.channelHandle,
      channelAvatarUrl: first.channelAvatarUrl,
      items: batch,
      latestVideoId: batch[0].videoId,
      thumbnailUrl: batch[0].thumbnailUrl,
      createdAt: batch[0].createdAt,
      unread: batch.some((n) => !n.read),
    });
    i = j;
  }

  return result;
}

function sectionLabel(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const days = ageMs / (24 * 60 * 60 * 1000);
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  return "Older";
}

function buildSections(groups: GroupedNotification[]) {
  const buckets = new Map<string, GroupedNotification[]>();
  for (const g of groups) {
    const label = sectionLabel(g.createdAt);
    const list = buckets.get(label) ?? [];
    list.push(g);
    buckets.set(label, list);
  }
  const order = ["Today", "This week", "Older"];
  return order
    .filter((title) => buckets.has(title))
    .map((title) => ({ title, data: buckets.get(title)! }));
}

export default function ReelsNotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { t } = useUiPreferences();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notifications, setNotifications] = useState<ReelsVideoNotification[]>([]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.dbId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetchReelsVideoNotifications(user.dbId, user.sessionToken);
      setNotifications(res.notifications ?? []);
    } catch {
      setLoadError(true);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.dbId, user?.sessionToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter(
      (n) =>
        n.videoTitle.toLowerCase().includes(q)
        || channelLabel(n).toLowerCase().includes(q),
    );
  }, [notifications, search]);

  const grouped = useMemo(() => groupNotifications(filtered), [filtered]);
  const sections = useMemo(() => buildSections(grouped), [grouped]);

  const openVideo = async (group: GroupedNotification) => {
    if (!user?.dbId) return;
    const ids = group.items.map((n) => n.id);
    void markReelsVideoNotificationsRead(user.dbId, user.sessionToken, ids);
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
    );
    router.push({ pathname: "/reels/watch/[id]", params: { id: String(group.latestVideoId) } });
  };

  const hideGroup = (group: GroupedNotification) => {
    if (!user?.dbId) return;
    Alert.alert("Remove notification?", "This will remove it from your list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            for (const item of group.items) {
              await hideReelsVideoNotification(user.dbId!, item.id, user.sessionToken);
            }
            setNotifications((prev) => prev.filter((n) => !group.items.some((g) => g.id === n.id)));
            await load();
          })();
        },
      },
    ]);
  };

  const summaryText = (group: GroupedNotification) => {
    if (group.items.length > 1) {
      return `Uploaded ${group.items.length} videos`;
    }
    return notificationSummary(group.items[0]);
  };

  const renderItem = ({ item }: { item: GroupedNotification }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.85}
      onPress={() => void openVideo(item)}
    >
      {item.unread ? <View style={styles.unreadDot} /> : <View style={styles.unreadSpacer} />}

      {item.channelAvatarUrl ? (
        <Image source={{ uri: item.channelAvatarUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 }}>
            {item.channelLabel.replace(/^@/, "")[0]?.toUpperCase() ?? "?"}
          </Text>
        </View>
      )}

      <View style={styles.rowBody}>
        <Text style={[styles.channelName, { color: colors.foreground }]} numberOfLines={1}>
          {item.channelLabel}
        </Text>
        <Text style={[styles.summary, { color: colors.foreground }]} numberOfLines={2}>
          {summaryText(item)}
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {formatTimeAgo(item.createdAt)}
        </Text>
      </View>

      <View style={styles.rowRight}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="videocam" size={18} color={colors.mutedForeground} />
          </View>
        )}
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => hideGroup(item)}
          style={styles.menuBtn}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifications</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setSearchOpen((v) => !v)} style={styles.headerIcon}>
            <Ionicons name="search" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {searchOpen ? (
        <View style={[styles.searchWrap, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, backgroundColor: colors.muted }]}
            placeholder="Search notifications"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      ) : null}

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <View style={[styles.tabChip, { backgroundColor: colors.foreground }]}>
          <Text style={[styles.tabChipText, { color: colors.background }]}>All</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 12 }}>{t("reels.notificationsError")}</Text>
          <TouchableOpacity onPress={() => void load()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("reels.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={48} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 12, textAlign: "center" }}>
            {t("reels.noNotifications")}
          </Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 8, textAlign: "center", paddingHorizontal: 32 }}>
            {search.trim()
              ? interpolate(t("reels.noSearchResults"), { query: search.trim() })
              : t("reels.noNotificationsHint")}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionTitle, { color: colors.foreground, backgroundColor: colors.background }]}>
              {title}
            </Text>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          stickySectionHeadersEnabled={false}
        />
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", marginLeft: 8 },
  headerActions: { flexDirection: "row" },
  headerIcon: { padding: 8 },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  tabs: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tabChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  tabChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1a73e8",
    marginTop: 16,
    marginRight: 8,
  },
  unreadSpacer: { width: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  rowBody: { flex: 1, minWidth: 0, paddingRight: 8 },
  channelName: { fontFamily: "Inter_700Bold", fontSize: 14 },
  summary: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2, lineHeight: 18 },
  time: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  rowRight: { alignItems: "flex-end", gap: 6 },
  thumb: { width: 86, height: 48, borderRadius: 6 },
  menuBtn: { padding: 2 },
});
