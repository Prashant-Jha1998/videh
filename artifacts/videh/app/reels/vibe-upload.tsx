import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  InteractionManager,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { VideoEditorPanel, defaultEditorMetadata } from "@/components/VideoEditorPanel";
import { VibeSoundPicker } from "@/components/VibeSoundPicker";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  activeHashtagQuery,
  applyHashtagSuggestion,
  autoThumbnailFromVideo,
  formatViewCount,
  suggestReelsHashtags,
  uploadVibeVideo,
  type ReelsHashtagStat,
} from "@/lib/reelsApi";
import { showUploadShareDialog } from "@/lib/reelsShare";
import { ensureUploadableFileUri } from "@/lib/prepareFileUpload";
import { VIBE_BRAND_NAME, VIBE_MAX_DURATION_SECONDS } from "@/lib/vibeVideo";
import type { SelectedSound, VideoEditorMetadata } from "@/lib/videoEditor";

const SCREEN_W = Dimensions.get("window").width;

/** expo-image-picker duration is ms; some Android builds return seconds. */
function normalizePickerDurationSec(duration: number | null | undefined): number {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return 0;
  if (duration > 1000) return Math.round(duration / 1000);
  return Math.round(duration);
}

async function applyPickedAsset(
  asset: ImagePicker.ImagePickerAsset,
  setters: {
    setVideoUri: (v: string) => void;
    setVideoMime: (v: string) => void;
    setDurationSec: (v: number) => void;
    setThumbUri: (v: string | null) => void;
    setThumbPreparing: (v: boolean) => void;
  },
): Promise<void> {
  const durSec = normalizePickerDurationSec(asset.duration);
  if (durSec > VIBE_MAX_DURATION_SECONDS) {
    Alert.alert("Too long", `${VIBE_BRAND_NAME} clips must be ${VIBE_MAX_DURATION_SECONDS} seconds or shorter.`);
    return;
  }
  setters.setThumbPreparing(true);
  try {
    const stableUri = await ensureUploadableFileUri(asset.uri, `vibe_${Date.now()}.mp4`);
    setters.setVideoUri(stableUri);
    setters.setVideoMime(asset.mimeType ?? "video/mp4");
    setters.setDurationSec(durSec > 0 ? durSec : VIBE_MAX_DURATION_SECONDS);
    setters.setThumbPreparing(false);
    InteractionManager.runAfterInteractions(() => {
      void autoThumbnailFromVideo(stableUri, durSec > 0 ? durSec : 1)
        .then((auto) => { if (auto) setters.setThumbUri(auto); });
    });
  } catch (e) {
    setters.setThumbPreparing(false);
    Alert.alert(
      "Could not open video",
      e instanceof Error ? e.message : "Try another clip or record with the camera.",
    );
  }
}

export default function VibeUploadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [title, setTitle] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState("video/mp4");
  const [durationSec, setDurationSec] = useState(0);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [thumbPreparing, setThumbPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [hashtagFocused, setHashtagFocused] = useState(false);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<ReelsHashtagStat[]>([]);
  const [hashtagSuggestLoading, setHashtagSuggestLoading] = useState(false);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [sharesEnabled, setSharesEnabled] = useState(true);
  const [editor, setEditor] = useState<VideoEditorMetadata>(defaultEditorMetadata());
  const [selectedSound, setSelectedSound] = useState<SelectedSound | null>(null);
  const [soundPickerVisible, setSoundPickerVisible] = useState(false);

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
      videoMaxDuration: VIBE_MAX_DURATION_SECONDS,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    await applyPickedAsset(result.assets[0], {
      setVideoUri,
      setVideoMime,
      setDurationSec,
      setThumbUri,
      setThumbPreparing,
    });
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Allow camera access to record a Vibe.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      quality: 1,
      videoMaxDuration: VIBE_MAX_DURATION_SECONDS,
    });
    if (result.canceled || !result.assets[0]) return;
    await applyPickedAsset(result.assets[0], {
      setVideoUri,
      setVideoMime,
      setDurationSec,
      setThumbUri,
      setThumbPreparing,
    });
  };

  const post = async () => {
    if (!user?.dbId || !videoUri || title.trim().length < 2) return;
    if (durationSec > VIBE_MAX_DURATION_SECONDS) {
      Alert.alert("Too long", `${VIBE_BRAND_NAME} clips must be ${VIBE_MAX_DURATION_SECONDS} seconds or shorter.`);
      return;
    }
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
      const res = await uploadVibeVideo({
        userId: user.dbId,
        title: title.trim(),
        description: editor.caption?.trim() ?? "",
        hashtags,
        durationSeconds: durationSec,
        videoUri,
        videoMime,
        thumbnailUri: thumbToUpload ?? undefined,
        sessionToken: user.sessionToken,
        onProgress: setProgress,
        commentsEnabled,
        sharesEnabled,
        editorMetadata: editor,
        musicTitle: selectedSound?.title ?? null,
        musicArtist: selectedSound?.artist ?? null,
        musicUrl: selectedSound?.audioUrl ?? null,
      });
      if (!res.success) {
        Alert.alert(
          res.moderationStatus === "rejected" ? "Clip blocked" : "Upload failed",
          res.message ?? "Try again.",
        );
        return;
      }
      if (!res.video) return;
      setVideoUri(null);
      const goVibe = () => {
        InteractionManager.runAfterInteractions(() => {
          router.replace({
            pathname: "/(tabs)/video",
            params: { section: "vibe", refreshFeed: "1" },
          } as never);
        });
      };
      if (res.pending) {
        showUploadShareDialog(res.video, {
          pending: true,
          pendingMessage: res.message ?? "Your clip is being checked. It will go public when approved.",
          onWatch: goVibe,
          onDone: goVibe,
        });
        return;
      }
      showUploadShareDialog(res.video, { onWatch: goVibe });
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
        <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
      </TouchableOpacity>

      <View style={styles.titleRow}>
        <Ionicons name="flash" size={24} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>Upload {VIBE_BRAND_NAME}</Text>
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Vertical short clips up to {VIBE_MAX_DURATION_SECONDS}s. Uploaded securely to cloud storage for fast playback.
      </Text>

      <View style={styles.pickRow}>
        <TouchableOpacity style={[styles.pickBtn, { borderColor: colors.border }]} onPress={pickVideo}>
          <Ionicons name="images-outline" size={28} color={colors.primary} />
          <Text style={{ color: colors.foreground, marginTop: 6, fontFamily: "Inter_600SemiBold" }}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pickBtn, { borderColor: colors.border }]} onPress={recordVideo}>
          <Ionicons name="videocam-outline" size={28} color={colors.primary} />
          <Text style={{ color: colors.foreground, marginTop: 6, fontFamily: "Inter_600SemiBold" }}>Record</Text>
        </TouchableOpacity>
      </View>

      {videoUri ? (
        <VideoEditorPanel
          videoUri={videoUri}
          durationSec={durationSec}
          isVibeFormat
          editor={editor}
          selectedSound={selectedSound}
          onChange={setEditor}
          onOpenSounds={() => setSoundPickerVisible(true)}
        />
      ) : (
        <TouchableOpacity style={[styles.pickBox, { borderColor: colors.border }]} onPress={pickVideo}>
          <Ionicons name="flash-outline" size={40} color={colors.primary} />
          <Text style={{ color: colors.foreground, marginTop: 8, fontFamily: "Inter_600SemiBold" }}>Select vertical clip</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Max {VIBE_MAX_DURATION_SECONDS} seconds</Text>
        </TouchableOpacity>
      )}

      {thumbPreparing ? (
        <View style={styles.thumbLoading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 13 }}>Preparing clip…</Text>
        </View>
      ) : null}

      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        placeholder="Title *"
        placeholderTextColor={colors.mutedForeground}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />

      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Hashtags</Text>
      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginBottom: 0 }]}
        placeholder="e.g. dance, comedy, travel"
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
                  {item.videoCount} videos · {formatViewCount(item.viewCount)} views
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : null}

      <View style={[styles.toggleRow, { borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Allow comments</Text>
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
          <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Allow sharing</Text>
        </View>
        <Switch
          value={sharesEnabled}
          onValueChange={setSharesEnabled}
          trackColor={{ true: colors.primary + "80", false: colors.muted }}
          thumbColor={sharesEnabled ? colors.primary : "#f4f3f4"}
        />
      </View>

      <TouchableOpacity
        style={[styles.postBtn, { backgroundColor: colors.primary, opacity: videoUri && title.trim() && !uploading && !thumbPreparing ? 1 : 0.5 }]}
        disabled={!videoUri || title.trim().length < 2 || uploading || thumbPreparing}
        onPress={post}
      >
        {uploading ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.postText}>{progress}% · uploading to cloud</Text>
          </>
        ) : (
          <Text style={styles.postText}>Post {VIBE_BRAND_NAME}</Text>
        )}
      </TouchableOpacity>

      <VibeSoundPicker
        visible={soundPickerVisible}
        sessionToken={user?.sessionToken}
        selected={selectedSound}
        onClose={() => setSoundPickerVisible(false)}
        onSelect={setSelectedSound}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 2 },
  backText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  hint: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  pickRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  pickBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
  },
  pickBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    height: Math.round(SCREEN_W * (16 / 9)),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  thumbLoading: { alignItems: "center", marginBottom: 12 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
    fontFamily: "Inter_400Regular",
  },
  suggestBox: { borderWidth: 1, borderRadius: 12, marginBottom: 14, overflow: "hidden" },
  suggestRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  toggleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 16,
  },
  postText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
