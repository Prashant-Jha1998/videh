import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ImageDrawModal } from "@/components/ImageDrawModal";
import { ManualImageCropModal } from "@/components/ManualImageCropModal";
import { useApp } from "@/context/AppContext";
import { authFetchHeaders, authPlaybackSource } from "@/lib/authenticatedMedia";
import { uploadChatMediaWithProgress } from "@/lib/chatMediaUpload";
import {
  applyImageQuality,
  cropImageRect,
  ensureEditableImageUri,
  imageExtFromUri,
  imageMimeFromUri,
  isGifUri,
  rotateImage,
  type MediaQuality,
} from "@/lib/imageEdit";

export default function ChatMediaComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, sendPreparedMediaMessage } = useApp();
  const params = useLocalSearchParams<{
    chatId?: string;
    uri?: string;
    kind?: string;
    viewOnce?: string;
  }>();

  const chatId = String(params.chatId ?? "");
  const initialUri = params.uri ? decodeURIComponent(String(params.uri)) : "";
  const kind = params.kind === "video" ? "video" : "image";
  const isViewOnce = params.viewOnce === "1";
  const [uri, setUri] = useState(initialUri);
  const [caption, setCaption] = useState("");
  const [quality, setQuality] = useState<MediaQuality>("standard");
  const [uploadPct, setUploadPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (kind !== "image" || isGifUri(initialUri)) return;
    let cancelled = false;
    void (async () => {
      try {
        const local = await ensureEditableImageUri(initialUri);
        if (!cancelled && local !== uri) setUri(local);
      } catch {
        /* keep original; crop may prompt again */
      }
    })();
    return () => { cancelled = true; };
  }, [initialUri, kind]);

  const mime = useMemo(() => {
    if (kind === "video") return uri.includes(".mov") ? "video/quicktime" : "video/mp4";
    return imageMimeFromUri(uri);
  }, [kind, uri]);
  const ext = kind === "video" ? (mime.includes("quicktime") ? "mov" : "mp4") : imageExtFromUri(uri);
  const isGif = kind === "image" && isGifUri(uri);

  async function onSend() {
    if (!chatId || !uri || busy) return;
    setBusy(true);
    setUploadPct(0);
    abortRef.current = new AbortController();
    try {
      let uploadUri = uri;
      if (kind === "image" && !isGif) uploadUri = await applyImageQuality(uri, quality);
      const uploaded = await uploadChatMediaWithProgress({
        uri: uploadUri,
        mime,
        filename: `chat_${Date.now()}.${ext}`,
        sessionToken: user?.sessionToken,
        signal: abortRef.current.signal,
        onProgress: (p) => setUploadPct(p.percent),
      });
      sendPreparedMediaMessage(chatId, {
        mediaUrl: uploaded.url,
        kind,
        caption: caption.trim(),
        isViewOnce,
      });
      router.back();
    } catch (e) {
      Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send media.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function onCropDone(rect: { originX: number; originY: number; width: number; height: number }) {
    setCropOpen(false);
    if (kind !== "image" || isGif || editing) return;
    setEditing(true);
    try {
      setUri(await cropImageRect(uri, quality, rect));
    } catch (e) {
      Alert.alert("Edit failed", e instanceof Error ? e.message : "Could not crop this photo.");
    } finally {
      setEditing(false);
    }
  }

  async function onRotate() {
    if (kind !== "image" || isGif || editing) return;
    setEditing(true);
    try {
      setUri(await rotateImage(uri, quality));
    } catch (e) {
      Alert.alert("Edit failed", e instanceof Error ? e.message : "Could not rotate this photo.");
    } finally {
      setEditing(false);
    }
  }

  function onCropPress() {
    if (kind !== "image" || isGif || editing || cropOpen || drawOpen) return;
    setCropOpen(true);
  }

  async function onDrawDone(drawnUri: string) {
    setDrawOpen(false);
    if (kind !== "image" || isGif || editing) return;
    setEditing(true);
    try {
      const local = await ensureEditableImageUri(drawnUri);
      setUri(local);
    } catch (e) {
      Alert.alert("Edit failed", e instanceof Error ? e.message : "Could not save drawing.");
    } finally {
      setEditing(false);
    }
  }

  function onDrawPress() {
    if (kind !== "image" || isGif || editing || cropOpen || drawOpen) return;
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Drawing is supported in the mobile app.");
      return;
    }
    setDrawOpen(true);
  }

  function onCancelUpload() {
    abortRef.current?.abort();
    setBusy(false);
    setUploadPct(0);
  }

  if (!uri || !chatId) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Invalid media</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageSource = uri.includes("/api/chats/media/") && user?.sessionToken
    ? { uri, headers: authFetchHeaders(user.sessionToken) as Record<string, string> }
    : { uri };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} disabled={busy}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isViewOnce ? "View once" : kind === "video" ? "Send video" : isGif ? "Send GIF" : "Send photo"}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {kind === "image" && !isGif && !isViewOnce ? (
        <View style={styles.qualityRow}>
          <TouchableOpacity
            style={[styles.qualityBtn, quality === "standard" && styles.qualityBtnActive]}
            onPress={() => setQuality("standard")}
            disabled={busy || editing}
          >
            <Text style={[styles.qualityText, quality === "standard" && styles.qualityTextActive]}>Standard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.qualityBtn, quality === "hd" && styles.qualityBtnActive]}
            onPress={() => setQuality("hd")}
            disabled={busy || editing}
          >
            <Text style={[styles.qualityText, quality === "hd" && styles.qualityTextActive]}>HD</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.previewWrap}>
        {kind === "video" ? (
          <Video
            source={authPlaybackSource(uri, user?.sessionToken)}
            style={styles.preview}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
          />
        ) : (
          <Image source={imageSource} style={styles.preview} contentFit="contain" />
        )}
        {isGif ? (
          <View style={styles.gifBadge}><Text style={styles.gifText}>GIF</Text></View>
        ) : null}
      </View>

      {kind === "image" && !isGif ? (
        <View style={styles.editRow}>
          <TouchableOpacity style={styles.editBtn} onPress={onCropPress} disabled={busy || editing}>
            <Ionicons name="crop" size={20} color="#fff" />
            <Text style={styles.editBtnText}>Crop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={onDrawPress} disabled={busy || editing}>
            <Ionicons name="brush" size={20} color="#fff" />
            <Text style={styles.editBtnText}>Draw</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={() => void onRotate()} disabled={busy || editing}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.editBtnText}>Rotate</Text>
          </TouchableOpacity>
          {editing ? <ActivityIndicator color="#00a884" style={{ marginLeft: 8 }} /> : null}
        </View>
      ) : null}

      <TextInput
        style={styles.caption}
        placeholder="Add a caption…"
        placeholderTextColor="#8696a0"
        value={caption}
        onChangeText={setCaption}
        editable={!busy}
        multiline
      />

      {busy ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color="#00a884" />
          <Text style={styles.progressText}>Uploading {uploadPct}%</Text>
          <TouchableOpacity onPress={onCancelUpload}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.sendBtn} onPress={() => void onSend()}>
          <Ionicons name="send" size={22} color="#fff" />
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      )}

      <ManualImageCropModal
        visible={cropOpen}
        imageUri={uri}
        onCancel={() => setCropOpen(false)}
        onDone={(rect) => void onCropDone(rect)}
      />
      <ImageDrawModal
        visible={drawOpen}
        imageUri={uri}
        onCancel={() => setDrawOpen(false)}
        onDone={(drawnUri) => void onDrawDone(drawnUri)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b141a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b141a" },
  err: { color: "#fff", marginBottom: 12 },
  link: { color: "#00a884", fontWeight: "600" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 8 },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  qualityRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  qualityBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: "#202c33", alignItems: "center" },
  qualityBtnActive: { backgroundColor: "#00a884" },
  qualityText: { color: "#8696a0", fontWeight: "600", fontSize: 14 },
  qualityTextActive: { color: "#fff" },
  previewWrap: { flex: 1, marginHorizontal: 12, borderRadius: 12, overflow: "hidden", backgroundColor: "#111b21", position: "relative" },
  preview: { flex: 1, width: "100%" },
  gifBadge: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  gifText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  editRow: { flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 10 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#202c33", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  editBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  caption: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#202c33",
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 16,
    maxHeight: 100,
  },
  sendBtn: {
    marginHorizontal: 16,
    backgroundColor: "#00a884",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginHorizontal: 16, paddingVertical: 14 },
  progressText: { color: "#fff", fontSize: 14 },
  cancelText: { color: "#ea4335", fontWeight: "600" },
});
