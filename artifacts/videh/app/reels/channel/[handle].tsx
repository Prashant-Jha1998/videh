import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  fetchMyReelsChannel,
  fetchReelsChannel,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsChannel,
  type ReelsMonetizationStatus,
  type ReelsPublicRules,
  type ReelsVideo,
} from "@/lib/reelsApi";

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);

export default function ReelsChannelScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [monetization, setMonetization] = useState<ReelsMonetizationStatus | null>(null);
  const [rules, setRules] = useState<ReelsPublicRules | null>(null);
  const [loading, setLoading] = useState(true);

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
      setMonetization(res.monetization ?? null);
      setRules(res.rules ?? null);
    }
    setLoading(false);
  }, [rawHandle, user?.dbId, user?.sessionToken, router]);

  useEffect(() => { void load(); }, [load]);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={videos}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <>
            <View style={styles.coverWrap}>
              {channel.coverUrl ? (
                <Image source={{ uri: channel.coverUrl }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, { backgroundColor: colors.primary }]} />
              )}
              <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                {channel.isOwner ? (
                  <TouchableOpacity onPress={() => router.push("/reels/channel/edit")} style={styles.backBtn}>
                    <Ionicons name="create-outline" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.profile}>
              <View style={styles.avatarOverlap}>
                {channel.avatarUrl ? (
                  <Image source={{ uri: channel.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
                    <Text style={{ color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" }}>@</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.displayName, { color: colors.foreground }]}>{displayLabel}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>@{channel.handle}</Text>
              {channel.bio ? (
                <Text style={{ color: colors.foreground, fontSize: 13, textAlign: "center", marginTop: 8 }}>{channel.bio}</Text>
              ) : null}
              <View style={styles.statsRow}>
                <Stat label="Subscribers" value={formatViewCount(channel.subscriberCount)} colors={colors} />
                <Stat label="Views" value={formatViewCount(channel.totalViews)} colors={colors} />
                <Stat label="Videos" value={String(videos.length)} colors={colors} />
              </View>
              {monetization ? (
                <View style={[styles.rulesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.rulesTitle, { color: colors.foreground }]}>
                    Monetization: {monetization.status.replace("_", " ")}
                    {monetization.eligible ? " ✓" : ""}
                  </Text>
                  {!monetization.eligible && monetization.reasons.length > 0 ? (
                    monetization.reasons.map((r) => (
                      <Text key={r} style={{ color: colors.mutedForeground, fontSize: 12 }}>• {r}</Text>
                    ))
                  ) : (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      Revenue share: {monetization.revenueSharePercent}%
                    </Text>
                  )}
                </View>
              ) : null}
              {rules ? (
                <View style={[styles.rulesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.rulesTitle, { color: colors.foreground }]}>Platform rules</Text>
                  {rules.monetization.rules.slice(0, 2).map((r) => (
                    <Text key={r} style={{ color: colors.mutedForeground, fontSize: 12 }}>• {r}</Text>
                  ))}
                </View>
              ) : null}
              {user?.dbId && !channel.isOwner ? (
                <TouchableOpacity
                  style={[styles.subBtn, { backgroundColor: channel.isSubscribed ? colors.muted : colors.primary }]}
                  onPress={async () => {
                    if (!user.dbId) return;
                    if (channel.isSubscribed) {
                      await unsubscribeReelsChannel(channel.id, user.dbId, user.sessionToken);
                    } else {
                      await subscribeReelsChannel(channel.id, user.dbId, user.sessionToken);
                    }
                    void load();
                  }}
                >
                  <Text style={styles.subBtnText}>{channel.isSubscribed ? "Subscribed" : "Subscribe"}</Text>
                </TouchableOpacity>
              ) : channel.isOwner ? (
                <TouchableOpacity
                  style={[styles.subBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => router.push("/reels/channel/edit")}
                >
                  <Text style={[styles.subBtnText, { color: colors.foreground }]}>Edit name · logo · cover</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={[styles.section, { color: colors.foreground }]}>Videos</Text>
          </>
        }
        ListEmptyComponent={<Text style={{ color: colors.mutedForeground, padding: 20 }}>No videos posted yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.ytCard}
            onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } })}
          >
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
                <Image source={{ uri: channel.avatarUrl }} style={styles.smallAvatar} />
              ) : (
                <View style={[styles.smallAvatar, { backgroundColor: colors.primary }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }} numberOfLines={2}>{item.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                  {formatViewCount(item.viewCount)} views{item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
                </Text>
              </View>
            </View>
            {item.status !== "published" || item.moderationStatus === "pending_scan" || item.moderationStatus === "pending_review" ? (
              <Text style={{ color: "#e6a700", fontSize: 11, marginLeft: 12, marginBottom: 8 }}>
                {item.moderationStatus === "rejected" ? "Blocked" : "Under review"}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color: colors.foreground }]}>{value}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverWrap: { position: "relative" },
  cover: { width: SCREEN_W, height: 140 },
  headerBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
  backBtn: { padding: 8, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 20 },
  profile: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, marginTop: -36 },
  avatarOverlap: { marginBottom: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: "#fff" },
  displayName: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 16 },
  stat: { alignItems: "center" },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24 },
  subBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
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
  rulesBox: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, width: "100%" },
  rulesTitle: { fontFamily: "Inter_600SemiBold", marginBottom: 6 },
});
