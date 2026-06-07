import { Ionicons } from "@expo/vector-icons";
import { Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ManualImageCropModal } from "@/components/ManualImageCropModal";
import { cropImageRect } from "@/lib/imageEdit";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  activeHashtagQuery,
  applyHashtagSuggestion,
  autoThumbnailFromVideo,
  formatViewCount,
  MAX_REELS_VIDEO_SECONDS,
  prepareReelsThumbnail,
  REELS_THUMB_ASPECT,
  REELS_THUMB_HINT,
  suggestReelsHashtags,
  uploadReelsVideo,
  type ReelsHashtagStat,
} from "@/lib/reelsApi";

export default function ReelsUploadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState("video/mp4");
  const [durationSec, setDurationSec] = useState(0);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [thumbCropUri, setThumbCropUri] = useState<string | null>(null);
  const [thumbPreparing, setThumbPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [hashtagFocused, setHashtagFocused] = useState(false);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<ReelsHashtagStat[]>([]);
  const [hashtagSuggestLoading, setHashtagSuggestLoading] = useState(false);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hashtagFocused) {
      setHashtagSuggestions([]);
      return;
    }
    const query = activeHashtagQuery(hashtags);
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(() => {
      setHashtagSuggestLoading(true);
      void suggestReelsHashtags(query, user?.sessionToken, 8)
        .then((res) => {
          if (res.success) setHashtagSuggestions(res.hashtags ?? []);
        })
        .finally(() => setHashtagSuggestLoading(false));
    }, query.length > 0 ? 250 : 0);
    return () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, [hashtags, hashtagFocused, user?.sessionToken]);

  const pickHashtagSuggestion = (tag: string) => {
    setHashtags(applyHashtagSuggestion(hashtags, tag));
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Allow access to your videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const durMs = asset.duration ?? 0;
    const durSec = Math.round(durMs / 1000);
    if (durSec > MAX_REELS_VIDEO_SECONDS) {
      Alert.alert("Too long", "Video must be 4 hours or shorter.");
      return;
    }
    setVideoUri(asset.uri);
    setVideoMime(asset.mimeType ?? "video/mp4");
    setDurationSec(durSec);
    setThumbPreparing(true);
    try {
      const auto = await autoThumbnailFromVideo(asset.uri, durSec);
      if (auto) setThumbUri(auto);
    } finally {
      setThumbPreparing(false);
    }
  };

  const pickThumb = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Allow access to your photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    setThumbCropUri(result.assets[0].uri);
  };

  const onThumbCropDone = async (rect: { originX: number; originY: number; width: number; height: number }) => {
    const src = thumbCropUri;
    setThumbCropUri(null);
    if (!src) return;
    setThumbPreparing(true);
    try {
      const cropped = await cropImageRect(src, "high", rect);
      const prepared = await prepareReelsThumbnail(cropped);
      setThumbUri(prepared);
    } catch {
      Alert.alert("Thumbnail", "Could not prepare image. Try another photo.");
    } finally {
      setThumbPreparing(false);
    }
  };

  const post = async () => {
    if (!user?.dbId || !videoUri || title.trim().length < 2) return;
    let thumbToUpload = thumbUri;
    if (!thumbToUpload) {
      setThumbPreparing(true);
      try {
        thumbToUpload = await autoThumbnailFromVideo(videoUri, durationSec);
      } finally {
        setThumbPreparing(false);
      }
    }
    setUploading(true);
    try {
      const res = await uploadReelsVideo({
        userId: user.dbId,
        title: title.trim(),
        description: description.trim(),
        hashtags,
        durationSeconds: durationSec,
        videoUri,
        videoMime,
        thumbnailUri: thumbToUpload ?? undefined,
        sessionToken: user.sessionToken,
        onProgress: setProgress,
      });
      if (!res.success) {
        Alert.alert(
          res.moderationStatus === "rejected" ? "Video blocked" : "Upload failed",
          res.message ?? "Try again.",
        );
        return;
      }
      if (res.pending) {
        Alert.alert(
          "Under review",
          res.message ?? "Your video is being checked for nudity and sexual content. It will go public when approved.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/video") }],
        );
        return;
      }
      router.replace({ pathname: "/reels/watch/[id]", params: { id: String(res.video!.id) } });
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={Platform.OS === "ios" ? 20 : 16}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="close" size={26} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>Upload video</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Upload videos of any length (up to 4 hours). Nudity/sexual content is auto-blocked before publish.
      </Text>

      <TouchableOpacity style={[styles.pickBox, { borderColor: colors.border }]} onPress={pickVideo}>
        {videoUri ? (
          <>
            <Video source={{ uri: videoUri }} style={styles.preview} useNativeControls resizeMode="contain" />
            <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>{durationSec}s selected</Text>
          </>
        ) : (
          <>
            <Ionicons name="videocam-outline" size={40} color={colors.primary} />
            <Text style={{ color: colors.foreground, marginTop: 8 }}>Select video</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Thumbnail</Text>
      <Text style={[styles.thumbHint, { color: colors.mutedForeground }]}>
        {REELS_THUMB_HINT} — optional; video se auto frame ban jayega agar skip karein.
      </Text>
      <TouchableOpacity
        style={[styles.thumbBox, { borderColor: colors.border }]}
        onPress={pickThumb}
        disabled={thumbPreparing}
      >
        {thumbPreparing ? (
          <ActivityIndicator color={colors.primary} />
        ) : thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumbPreview} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons name="image-outline" size={36} color={colors.primary} />
            <Text style={{ color: colors.foreground, marginTop: 8 }}>Custom thumbnail (optional)</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>16:9 landscape</Text>
          </View>
        )}
      </TouchableOpacity>

      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        placeholder="Title *"
        placeholderTextColor={colors.mutedForeground}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <TextInput
        style={[styles.input, styles.area, { color: colors.foreground, borderColor: colors.border }]}
        placeholder="Description"
        placeholderTextColor={colors.mutedForeground}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={5000}
      />
      <Text style={[styles.sectionLabel, { color: colors.foreground, marginTop: 4 }]}>Hashtags</Text>
      <Text style={[styles.thumbHint, { color: colors.mutedForeground, marginBottom: 8 }]}>
        Type karein — suggestions mein kitne videos aur views hain woh dikhega (max 20 tags).
      </Text>
      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginBottom: 0 }]}
        placeholder="e.g. travel, music, vlog"
        placeholderTextColor={colors.mutedForeground}
        value={hashtags}
        onChangeText={setHashtags}
        onFocus={() => setHashtagFocused(true)}
        onBlur={() => setTimeout(() => setHashtagFocused(false), 200)}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {hashtagFocused && (hashtagSuggestLoading || hashtagSuggestions.length > 0) ? (
        <View style={[styles.suggestBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.suggestHeading, { color: colors.mutedForeground }]}>
            {activeHashtagQuery(hashtags).length > 0 ? "Suggestions" : "Popular hashtags"}
          </Text>
          {hashtagSuggestLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
          ) : (
            hashtagSuggestions.map((item) => (
              <TouchableOpacity
                key={item.tag}
                style={[styles.suggestRow, { borderBottomColor: colors.border }]}
                onPress={() => pickHashtagSuggestion(item.tag)}
              >
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>#{item.tag}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {item.videoCount} {item.videoCount === 1 ? "video" : "videos"} · {formatViewCount(item.viewCount)} views
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.postBtn, { backgroundColor: colors.primary, opacity: videoUri && title.trim() && !uploading && !thumbPreparing ? 1 : 0.5 }]}
        disabled={!videoUri || title.trim().length < 2 || uploading || thumbPreparing}
        onPress={post}
      >
        {uploading ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.postText}>{progress}%</Text>
          </>
        ) : (
          <Text style={styles.postText}>Post video</Text>
        )}
      </TouchableOpacity>

      <ManualImageCropModal
        visible={Boolean(thumbCropUri)}
        imageUri={thumbCropUri ?? ""}
        aspectRatio={REELS_THUMB_ASPECT}
        title="Thumbnail"
        hint="Drag to position · 16:9 YouTube-style frame"
        onCancel={() => setThumbCropUri(null)}
        onDone={(rect) => void onThumbCropDone(rect)}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { marginBottom: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 13, marginBottom: 16 },
  pickBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    minHeight: 160,
  },
  preview: { width: "100%", height: 180, borderRadius: 8 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 4 },
  thumbHint: { fontSize: 12, marginBottom: 8 },
  thumbBox: {
    width: "100%",
    aspectRatio: REELS_THUMB_ASPECT,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
  thumbPreview: { width: "100%", height: "100%" },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center", padding: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  area: { minHeight: 100, textAlignVertical: "top" },
  suggestBox: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 12,
    overflow: "hidden",
  },
  suggestHeading: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  suggestRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  postBtn: { flexDirection: "row", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 28, marginTop: 8 },
  postText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
