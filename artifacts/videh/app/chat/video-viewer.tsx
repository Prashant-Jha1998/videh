import { Ionicons } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { saveVideoUriToLibrary } from "@/lib/saveVideoToLibrary";
import { usePlayableVideoUri } from "@/lib/usePlayableVideoUri";
import { formatRelativeHeader } from "@/utils/time";

const { width: W } = Dimensions.get("window");

export default function ChatVideoViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playUri: playUriEncoded, senderLabel, timestamp } = useLocalSearchParams<{
    playUri?: string;
    senderLabel?: string;
    timestamp?: string;
  }>();

  const playUri = playUriEncoded ? decodeURIComponent(String(playUriEncoded)) : "";
  const { playableUri, failed, loading } = usePlayableVideoUri(playUri || undefined);
  const videoRef = useRef<Video>(null);
  const [saving, setSaving] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!playUri) router.back();
  }, [playUri, router]);

  useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
  }, []);

  useEffect(() => {
    setEnded(false);
  }, [playableUri]);

  const ts = timestamp ? Number(timestamp) : Date.now();
  const sub = formatRelativeHeader(Number.isFinite(ts) ? ts : Date.now());
  const title = senderLabel?.trim() || "Video";

  const onDownload = useCallback(async () => {
    if (!playUri || saving) return;
    setSaving(true);
    try {
      const res = await saveVideoUriToLibrary(playUri);
      if (res.ok) {
        Alert.alert("Saved", "Video saved to your gallery.");
      } else {
        Alert.alert("Could not save", res.message);
      }
    } finally {
      setSaving(false);
    }
  }, [playUri, saving]);

  const replay = useCallback(async () => {
    setEnded(false);
    await videoRef.current?.setStatusAsync({ positionMillis: 0, shouldPlay: true });
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingHorizontal: 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerName} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {Platform.OS !== "web" ? (
          <TouchableOpacity
            onPress={() => { void onDownload(); }}
            style={styles.headerIcon}
            disabled={saving || !playUri}
            hitSlop={12}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="download-outline" size={26} color="#fff" />
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.body}>
        {failed ? (
          <View style={styles.centerBox}>
            <Ionicons name="alert-circle-outline" size={48} color="#94a3b8" />
            <Text style={styles.errText}>Video could not be loaded</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.backPill}>
              <Text style={styles.backPillText}>Go back</Text>
            </TouchableOpacity>
          </View>
        ) : loading || !playableUri ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loadingText}>Preparing video…</Text>
          </View>
        ) : (
          <View style={styles.videoBox}>
            <Video
              ref={videoRef}
              source={{ uri: playableUri }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isLooping={false}
              onError={() => {
                Alert.alert("Video error", "Could not play this video on this device.");
              }}
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded && status.didJustFinish) {
                  setEnded(true);
                  videoRef.current?.setStatusAsync({ positionMillis: 0, shouldPlay: false }).catch(() => {});
                }
              }}
            />
            {ended ? (
              <TouchableOpacity style={styles.replayOverlay} onPress={() => { void replay(); }} activeOpacity={0.85}>
                <Ionicons name="play-circle" size={74} color="rgba(255,255,255,0.94)" />
                <Text style={styles.replayText}>Play again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.replyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
        onPress={() => router.back()}
        activeOpacity={0.85}
      >
        <Ionicons name="happy-outline" size={22} color="#94a3b8" />
        <View style={styles.replyPill}>
          <Ionicons name="arrow-undo" size={18} color="#94a3b8" />
          <Text style={styles.replyText}>Reply</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b141a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1f2c34",
    paddingBottom: 10,
  },
  headerIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitles: { flex: 1, minWidth: 0 },
  headerName: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerSub: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" },
  body: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  videoBox: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  video: { width: W, flex: 1, backgroundColor: "#000" },
  replayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  replayText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  centerBox: { padding: 24, alignItems: "center", justifyContent: "center", gap: 12 },
  errText: { color: "#e2e8f0", fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  loadingText: { color: "#94a3b8", fontSize: 14, marginTop: 8, fontFamily: "Inter_400Regular" },
  backPill: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#00a884",
  },
  backPillText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#1f2c34",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  replyPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2a3942",
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  replyText: { color: "#94a3b8", fontSize: 15, fontFamily: "Inter_500Medium" },
});
