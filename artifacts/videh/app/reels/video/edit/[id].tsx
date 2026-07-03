import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  activeHashtagQuery,
  applyHashtagSuggestion,
  fetchReelsVideo,
  suggestReelsHashtags,
  updateReelsVideo,
  type ReelsHashtagStat,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { VIBE_BRAND_NAME, VIBE_MAX_DURATION_SECONDS, type VideoFormat } from "@/lib/vibeVideo";

export default function ReelsVideoEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const videoId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [video, setVideo] = useState<ReelsVideo | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("watch");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [sharesEnabled, setSharesEnabled] = useState(true);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<ReelsHashtagStat[]>([]);

  useEffect(() => {
    if (!user?.dbId || !videoId) return;
    void fetchReelsVideo(videoId, user.dbId, user.sessionToken).then((res) => {
      if (!res.success || !res.video) {
        Alert.alert("Not found", "Video could not be loaded.", [{ text: "OK", onPress: () => router.back() }]);
        return;
      }
      setVideo(res.video);
      setTitle(res.video.title);
      setDescription(res.video.description ?? "");
      setHashtags((res.video.hashtags ?? []).join(", "));
      setVideoFormat(res.video.videoFormat ?? "watch");
      setCommentsEnabled(res.video.commentsEnabled !== false);
      setSharesEnabled(res.video.sharesEnabled !== false);
      setLoading(false);
    });
  }, [user?.dbId, user?.sessionToken, videoId, router]);

  useEffect(() => {
    const query = activeHashtagQuery(hashtags);
    void suggestReelsHashtags(query, user?.sessionToken, 6).then((res) => {
      if (res.success) setHashtagSuggestions(res.hashtags ?? []);
    });
  }, [hashtags, user?.sessionToken]);

  const save = async () => {
    if (!user?.dbId) return;
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      Alert.alert("Title", "Enter a title (at least 2 characters).");
      return;
    }
    if (videoFormat === "vibe" && (video?.durationSeconds ?? 0) > VIBE_MAX_DURATION_SECONDS) {
      Alert.alert("Format", `${VIBE_BRAND_NAME} requires video length ≤ ${VIBE_MAX_DURATION_SECONDS}s.`);
      return;
    }
    setSaving(true);
    try {
      const res = await updateReelsVideo(
        videoId,
        user.dbId,
        {
          title: trimmed,
          description: description.trim(),
          hashtags,
          videoFormat,
          commentsEnabled,
          sharesEnabled,
        },
        user.sessionToken,
      );
      if (!res.success) {
        Alert.alert("Error", res.message ?? "Could not save changes.");
        return;
      }
      Alert.alert("Saved", "Video details updated.", [{ text: "OK", onPress: () => router.back() }]);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const vibeDisabled = (video?.durationSeconds ?? 0) > VIBE_MAX_DURATION_SECONDS;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Edit video</Text>
        <TouchableOpacity onPress={() => void save()} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Format</Text>
        <View style={styles.formatRow}>
          {(["watch", "vibe"] as VideoFormat[]).map((fmt) => {
            const active = videoFormat === fmt;
            const disabled = fmt === "vibe" && vibeDisabled;
            return (
              <TouchableOpacity
                key={fmt}
                disabled={disabled}
                style={[
                  styles.formatChip,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + "18" : colors.card,
                    opacity: disabled ? 0.45 : 1,
                  },
                ]}
                onPress={() => setVideoFormat(fmt)}
              >
                <Text style={{ color: active ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                  {fmt === "watch" ? "Watch" : VIBE_BRAND_NAME}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>Title</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          placeholder="Video title"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={5000}
          placeholder="Tell viewers about your video"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>Hashtags</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          value={hashtags}
          onChangeText={setHashtags}
          placeholder="travel, vlog, india"
          placeholderTextColor={colors.mutedForeground}
        />
        {hashtagSuggestions.length > 0 ? (
          <View style={styles.suggestRow}>
            {hashtagSuggestions.map((h) => (
              <TouchableOpacity
                key={h.tag}
                style={[styles.suggestChip, { backgroundColor: colors.muted }]}
                onPress={() => setHashtags(applyHashtagSuggestion(hashtags, h.tag))}
              >
                <Text style={{ color: colors.foreground, fontSize: 12 }}>#{h.tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 20 }]}>Engagement</Text>
        <View style={[styles.toggleRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Comments</Text>
            <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Allow viewers to comment</Text>
          </View>
          <Switch
            value={commentsEnabled}
            onValueChange={setCommentsEnabled}
            trackColor={{ true: colors.primary + "80", false: colors.muted }}
            thumbColor={commentsEnabled ? colors.primary : "#f4f3f4"}
          />
        </View>
        <View style={[styles.toggleRow, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Sharing</Text>
            <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>Allow link shares & share count</Text>
          </View>
          <Switch
            value={sharesEnabled}
            onValueChange={setSharesEnabled}
            trackColor={{ true: colors.primary + "80", false: colors.muted }}
            thumbColor={sharesEnabled ? colors.primary : "#f4f3f4"}
          />
        </View>

        {(video?.shareCount ?? 0) > 0 ? (
          <Text style={[styles.stats, { color: colors.mutedForeground }]}>
            {video?.shareCount} total shares · helps reach more viewers
          </Text>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  suggestChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  formatRow: { flexDirection: "row", gap: 10 },
  formatChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  toggleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  toggleHint: { fontSize: 12, marginTop: 2 },
  stats: { fontSize: 12, marginTop: 12 },
});
