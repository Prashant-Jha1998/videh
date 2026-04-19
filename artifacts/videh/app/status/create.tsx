import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";

const { width: W, height: H } = Dimensions.get("window");

const TEXT_BG_COLORS = [
  "#00A884", "#128C7E", "#075E54",
  "#2563EB", "#7C3AED", "#DB2777",
  "#DC2626", "#EA580C", "#CA8A04",
  "#16A34A", "#0891B2", "#374151",
  "#1F2937", "#6B21A8", "#BE123C",
];

const TEXT_COLORS = ["#FFFFFF", "#000000", "#F3F4F6", "#FEF9C3", "#ECFDF5"];

export default function StatusCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addStatus } = useApp();
  const params = useLocalSearchParams<{ mode?: string }>();

  const [mode, setMode] = useState<"text" | "media">(params.mode === "camera" ? "media" : "text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(TEXT_BG_COLORS[0]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [fontIdx, setFontIdx] = useState(0);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const fonts = ["Inter_400Regular", "Inter_700Bold", "Inter_300Light", "Inter_600SemiBold"];
  const fontLabels = ["Aa", "𝐁", "𝐿", "𝑺"];

  useEffect(() => {
    if (mode === "media") pickMedia();
    else setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Please allow access to your photos and videos.");
      setMode("text");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) { setMode("text"); return; }
    const asset = result.assets[0];
    setMediaUri(asset.uri);
    setMediaType(asset.type === "video" ? "video" : "image");
  };

  const postStatus = async () => {
    if (posting) return;
    if (mode === "text" && !text.trim()) { Alert.alert("Empty status", "Please write something."); return; }
    setPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (mode === "text") {
        await addStatus(text.trim(), "text", bgColor);
      } else if (mediaUri) {
        const content = caption.trim() || (mediaType === "video" ? "📹 Video" : "📷 Photo");
        await addStatus(content, mediaType, bgColor, mediaUri);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setPosting(false);
      Alert.alert("Error", "Could not post status. Please try again.");
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission Denied", "Please allow camera access."); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === "video" ? "video" : "image");
      setMode("media");
    }
  };

  // ── MEDIA MODE ────────────────────────────────────────────────────────────
  if (mode === "media") {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {/* Back + pick another */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={openCamera} style={styles.iconBtn}>
            <Ionicons name="camera-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={pickMedia} style={styles.iconBtn}>
            <Ionicons name="images-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Media preview */}
        {mediaUri ? (
          <View style={styles.mediaPreview}>
            {mediaType === "video" ? (
              <VideoPreview uri={mediaUri} />
            ) : (
              <Image source={{ uri: mediaUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
            )}
          </View>
        ) : (
          <View style={[styles.mediaPreview, { alignItems: "center", justifyContent: "center" }]}>
            <TouchableOpacity onPress={pickMedia} style={styles.pickMediaBtn}>
              <Ionicons name="images-outline" size={40} color="#fff" />
              <Text style={styles.pickMediaText}>Choose photo or video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Caption + post */}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.captionBar, { paddingBottom: insets.bottom + 8 }]}>
            <View style={[styles.captionInput, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
              <Ionicons name="happy-outline" size={22} color="rgba(255,255,255,0.7)" />
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                style={styles.captionText}
                multiline
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: "#00A884", opacity: posting ? 0.7 : 1 }]}
              onPress={postStatus}
              disabled={posting}
            >
              {posting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={22} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── TEXT MODE ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {/* Font cycle */}
        <TouchableOpacity style={styles.iconBtn} onPress={() => setFontIdx((i) => (i + 1) % fonts.length)}>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{fontLabels[fontIdx]}</Text>
        </TouchableOpacity>
        {/* Text color cycle */}
        <TouchableOpacity
          style={[styles.textColorBtn, { backgroundColor: textColor, borderColor: textColor === "#FFFFFF" ? "rgba(255,255,255,0.4)" : "transparent" }]}
          onPress={() => setTextColor(tc => { const idx = TEXT_COLORS.indexOf(tc); return TEXT_COLORS[(idx + 1) % TEXT_COLORS.length]; })}
        />
        {/* Switch to media */}
        <TouchableOpacity onPress={() => { setMode("media"); pickMedia(); }} style={styles.iconBtn}>
          <Ionicons name="image-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Text input area */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity style={styles.textArea} activeOpacity={1} onPress={() => inputRef.current?.focus()}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="Type a status..."
            placeholderTextColor={`${textColor}80`}
            style={[styles.textInput, { color: textColor, fontFamily: fonts[fontIdx] }]}
            multiline
            textAlignVertical="center"
            textAlign="center"
            maxLength={700}
          />
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Bottom: color palette + post button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorPalette}>
          {TEXT_BG_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.colorDot, { backgroundColor: c }, bgColor === c && styles.colorDotSelected]}
              onPress={() => { setBgColor(c); Haptics.selectionAsync(); }}
            />
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.postBtn, { backgroundColor: text.trim() ? "#00A884" : "rgba(255,255,255,0.3)", opacity: posting ? 0.7 : 1 }]}
          onPress={postStatus}
          disabled={posting || !text.trim()}
        >
          {posting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.postBtnText}>Post</Text>
              <Ionicons name="send" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Char counter */}
      {text.length > 0 && (
        <Text style={[styles.charCount, { color: `${textColor}80` }]}>{700 - text.length}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 4 },
  iconBtn: { padding: 10 },
  textColorBtn: { width: 26, height: 26, borderRadius: 13, margin: 8, borderWidth: 1.5 },
  textArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  textInput: { fontSize: 28, textAlign: "center", width: "100%", lineHeight: 38 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  colorPalette: { gap: 10, paddingHorizontal: 4, paddingVertical: 4 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { transform: [{ scale: 1.25 }], borderWidth: 2.5, borderColor: "#fff" },
  postBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 28 },
  postBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  charCount: { position: "absolute", top: 80, right: 18, fontSize: 13 },
  // Media mode
  mediaPreview: { flex: 1, width: W },
  captionBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  captionInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, minHeight: 48 },
  captionText: { flex: 1, color: "#fff", fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  pickMediaBtn: { alignItems: "center", gap: 16 },
  pickMediaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
