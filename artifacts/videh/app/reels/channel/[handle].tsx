import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  formatViewCount,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsChannel,
  type ReelsMonetizationStatus,
  type ReelsPublicRules,
  type ReelsVideo,
} from "@/lib/reelsApi";

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={styles.profile}>
        {channel.avatarUrl ? (
          <Image source={{ uri: channel.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" }}>@</Text>
          </View>
        )}
        <Text style={[styles.handle, { color: colors.foreground }]}>@{channel.handle}</Text>
        {channel.ownerName ? (
          <Text style={{ color: colors.mutedForeground }}>{channel.ownerName}</Text>
        ) : null}
        <View style={styles.statsRow}>
          <Stat label="Subscribers" value={formatViewCount(channel.subscriberCount)} colors={colors} />
          <Stat label="Views" value={formatViewCount(channel.totalViews)} colors={colors} />
          <Stat label="View hours" value={channel.totalViewHours.toFixed(1)} colors={colors} />
        </View>
        <View style={[styles.statsRow, { marginTop: 8 }]}>
          <Stat label="Likes" value={formatViewCount(channel.totalLikes ?? 0)} colors={colors} />
          <Stat label="Comments" value={formatViewCount(channel.totalComments ?? 0)} colors={colors} />
          <Stat label="Shares" value={formatViewCount(channel.totalShares ?? 0)} colors={colors} />
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
            {rules.monetization.rules.slice(0, 3).map((r) => (
              <Text key={r} style={{ color: colors.mutedForeground, fontSize: 12 }}>• {r}</Text>
            ))}
            {rules.playButton.rules.slice(0, 2).map((r) => (
              <Text key={`p-${r}`} style={{ color: colors.mutedForeground, fontSize: 12 }}>• {r}</Text>
            ))}
            {(rules.contentModeration?.rules ?? []).slice(0, 3).map((r) => (
              <Text key={`c-${r}`} style={{ color: colors.mutedForeground, fontSize: 12 }}>• {r}</Text>
            ))}
          </View>
        ) : null}
        {user?.dbId && channel.userId !== user.dbId ? (
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
        ) : null}
      </View>

      <Text style={[styles.section, { color: colors.foreground }]}>Videos</Text>
      <FlatList
        data={videos}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={<Text style={{ color: colors.mutedForeground, padding: 20 }}>No videos posted yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.videoRow}
            onPress={() => router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id) } })}
          >
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.muted }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>{item.title}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                {formatViewCount(item.viewCount)} views · {formatDuration(item.durationSeconds)}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>
                👍 {item.likeCount} · 💬 {item.commentCount} · ↗ {item.shareCount ?? 0} · 👎 {item.dislikeCount}
              </Text>
              {item.status !== "published" || item.moderationStatus === "pending_scan" || item.moderationStatus === "pending_review" ? (
                <Text style={{ color: "#e6a700", fontSize: 11, marginTop: 4 }}>
                  {item.moderationStatus === "rejected" ? "Blocked" : "Under review"}
                </Text>
              ) : null}
            </View>
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
  header: { paddingHorizontal: 12, paddingBottom: 8 },
  profile: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 20 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  handle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 24, marginTop: 16 },
  stat: { alignItems: "center" },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 24 },
  subBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  section: { fontSize: 16, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, marginBottom: 8 },
  videoRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  thumb: { width: 120, height: 68, borderRadius: 8 },
  rulesBox: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, width: "100%" },
  rulesTitle: { fontFamily: "Inter_600SemiBold", marginBottom: 6 },
});
