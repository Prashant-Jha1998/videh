import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
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
} from "@/lib/reelsApi";

export default function ReelsVideoEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const videoId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [hashtagSuggestions, setHashtagSuggestions] = useState<ReelsHashtagStat[]>([]);

  useEffect(() => {
    if (!user?.dbId || !videoId) return;
    void fetchReelsVideo(videoId, user.dbId, user.sessionToken).then((res) => {
      if (!res.success || !res.video) {
        Alert.alert("Not found", "Video could not be loaded.", [{ text: "OK", onPress: () => router.back() }]);
        return;
      }
      setTitle(res.video.title);
      setDescription(res.video.description ?? "");
      setHashtags((res.video.hashtags ?? []).join(", "));
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
    setSaving(true);
    try {
      const res = await updateReelsVideo(
        videoId,
        user.dbId,
        { title: trimmed, description: description.trim(), hashtags },
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
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Title</Text>
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

        <Text style={[styles.studioHint, { color: colors.mutedForeground }]}>
          Advanced settings: visibility, monetization, and comments are managed from your channel studio.
        </Text>
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
  studioHint: { fontSize: 12, lineHeight: 18, marginTop: 24 },
});
