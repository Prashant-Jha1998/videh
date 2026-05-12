import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const { width: W } = Dimensions.get("window");
const MAX_STORY_PARTICIPANTS = 100;
type AudienceMode = "all_contacts" | "selected_contacts";
type StoryContact = { id: number; name: string; phone: string };

function formatMediaDuration(durationMs?: number | null): string {
  if (!durationMs || durationMs <= 0) return "0:00";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatMediaSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />;
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("91") && digits.length === 13) return `+${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

const TEXT_BG_COLORS = ["#00A884", "#128C7E", "#075E54", "#2563EB", "#7C3AED", "#DB2777", "#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#0891B2", "#374151", "#1F2937", "#6B21A8", "#BE123C"];
const TEXT_COLORS = ["#FFFFFF", "#000000", "#F3F4F6", "#FEF9C3", "#ECFDF5"];

export default function StatusCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addStatus } = useApp();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<"text" | "media">(params.mode === "camera" ? "media" : "text");
  const [stage, setStage] = useState<"compose" | "audience">("compose");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(TEXT_BG_COLORS[0]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [fontIdx, setFontIdx] = useState(0);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaDurationMs, setMediaDurationMs] = useState<number | null>(null);
  const [mediaSizeBytes, setMediaSizeBytes] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [storySubject, setStorySubject] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all_contacts");
  const [audienceContacts, setAudienceContacts] = useState<StoryContact[]>([]);
  const [selectedAudienceIds, setSelectedAudienceIds] = useState<number[]>([]);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [audienceLoading, setAudienceLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const fonts = ["Inter_400Regular", "Inter_700Bold", "Inter_300Light", "Inter_600SemiBold"];
  const fontLabels = ["Aa", "𝐁", "𝐿", "𝑺"];
  const mediaDurationLabel = formatMediaDuration(mediaDurationMs);
  const mediaSizeLabel = formatMediaSize(mediaSizeBytes);

  useEffect(() => {
    if (mode === "media") pickMedia();
    else setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const loadAudienceContacts = async () => {
    if (Platform.OS === "web") {
      setAudienceContacts([]);
      return;
    }
    setAudienceLoading(true);
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        setAudienceContacts([]);
        return;
      }
      const contactResp = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers] });
      const phones = new Set<string>();
      for (const c of contactResp.data) {
        if (!c.phoneNumbers?.length) continue;
        for (const pn of c.phoneNumbers) {
          const normalized = normalizePhone(pn.number ?? "");
          if (normalized.length >= 10) phones.add(normalized);
        }
      }
      if (phones.size === 0) {
        setAudienceContacts([]);
        return;
      }
      const res = await fetch(`${getApiUrl()}/api/users/check-phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: Array.from(phones) }),
      });
      const data = await res.json() as { registered?: Record<string, any> };
      const entries = Object.values(data.registered ?? {}).map((u: any) => ({ id: Number(u.id), name: u.name ?? u.phone, phone: u.phone })) as StoryContact[];
      entries.sort((a, b) => a.name.localeCompare(b.name));
      setAudienceContacts(entries);
    } catch {
      setAudienceContacts([]);
    } finally {
      setAudienceLoading(false);
    }
  };

  const toggleAudienceContact = (id: number) => {
    setSelectedAudienceIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_STORY_PARTICIPANTS) {
        Alert.alert("Limit reached", `You can select up to ${MAX_STORY_PARTICIPANTS} participants.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Please allow access to your photos and videos.");
      setMode("text");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsEditing: false, quality: 0.8, base64: false });
    if (result.canceled || !result.assets[0]) { setMode("text"); return; }
    const asset = result.assets[0];
    if (asset.type === "video" && typeof asset.duration === "number" && asset.duration > 120000) {
      Alert.alert("Video too long", "Please select a video up to 2 minutes.");
      return;
    }
    setMediaUri(asset.uri);
    setMediaType(asset.type === "video" ? "video" : "image");
    setMediaDurationMs(typeof asset.duration === "number" ? asset.duration : null);
    setMediaSizeBytes(typeof asset.fileSize === "number" ? asset.fileSize : null);
  };

  const showEditorTool = (label: string) => {
    Haptics.selectionAsync();
    Alert.alert(label, "This editor tool is ready in the layout. Media editing will be connected next.");
  };

  const proceedToAudience = async () => {
    if (mode === "text" && !text.trim()) {
      Alert.alert("Empty story", "Write a message or switch to photo/video.");
      return;
    }
    if (mode === "media" && !mediaUri) {
      Alert.alert("Select media", "Choose a photo or video first.");
      return;
    }
    setStage("audience");
    if (audienceContacts.length === 0) await loadAudienceContacts();
  };

  const postStatus = async () => {
    if (posting) return;
    if (audienceMode === "selected_contacts" && selectedAudienceIds.length === 0) {
      Alert.alert("Select participants", "Choose at least one contact in selected mode.");
      return;
    }
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
      Alert.alert("Error", "Could not publish story. Please try again.");
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission denied", "Please allow camera access."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], allowsEditing: false, quality: 0.8, base64: false });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.type === "video" && typeof asset.duration === "number" && asset.duration > 120000) {
        Alert.alert("Video too long", "Please record a video up to 2 minutes.");
        return;
      }
      setMediaUri(asset.uri);
      setMediaType(asset.type === "video" ? "video" : "image");
      setMediaDurationMs(typeof asset.duration === "number" ? asset.duration : null);
      setMediaSizeBytes(typeof asset.fileSize === "number" ? asset.fileSize : null);
      setMode("media");
    }
  };

  const filteredAudience = audienceContacts.filter((c) => {
    const q = audienceSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  if (stage === "audience") {
    return (
      <View style={[styles.container, { backgroundColor: "#111B21", paddingTop: insets.top + 8 }]}>
        <View style={styles.audienceHeader}>
          <TouchableOpacity onPress={() => setStage("compose")} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.audienceTitle}>Story audience setup</Text>
            <Text style={styles.audienceSub}>Choose who can view this story.</Text>
          </View>
        </View>

        <View style={styles.audienceCard}>
          <Text style={styles.settingLabel}>Story subject</Text>
          <TextInput style={styles.settingInput} value={storySubject} onChangeText={setStorySubject} placeholder="e.g. Family updates" placeholderTextColor="#7f97a3" />
        </View>

        <View style={styles.audienceCard}>
          <Text style={styles.settingLabel}>Participants</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity style={[styles.modeBtn, audienceMode === "all_contacts" && styles.modeBtnActive]} onPress={() => setAudienceMode("all_contacts")}>
              <Text style={styles.modeBtnText}>All contacts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeBtn, audienceMode === "selected_contacts" && styles.modeBtnActive]} onPress={() => setAudienceMode("selected_contacts")}>
              <Text style={styles.modeBtnText}>Selected contacts</Text>
            </TouchableOpacity>
          </View>
          {audienceMode === "selected_contacts" && (
            <>
              <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={17} color="#8ea2ad" />
                <TextInput style={styles.searchInput} placeholder="Search members" placeholderTextColor="#7f97a3" value={audienceSearch} onChangeText={setAudienceSearch} />
              </View>
              {selectedAudienceIds.length > 0 && (
                <View style={styles.chipsWrap}>
                  {selectedAudienceIds.map((id) => {
                    const c = audienceContacts.find((x) => x.id === id);
                    if (!c) return null;
                    return (
                      <TouchableOpacity key={id} style={styles.chip} onPress={() => toggleAudienceContact(id)}>
                        <Text style={styles.chipText}>{c.name.split(" ")[0]}</Text>
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <Text style={styles.limitHint}>Selected {selectedAudienceIds.length}/{MAX_STORY_PARTICIPANTS}</Text>
              {audienceLoading ? (
                <ActivityIndicator color="#00A884" style={{ marginVertical: 16 }} />
              ) : (
                <ScrollView style={styles.membersList} contentContainerStyle={{ paddingBottom: 14 }}>
                  {filteredAudience.map((m) => {
                    const selected = selectedAudienceIds.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} style={styles.memberRow} onPress={() => toggleAudienceContact(m.id)}>
                        <Text style={styles.memberName}>{m.name}</Text>
                        <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? "#00A884" : "#8ea2ad"} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}
        </View>

        <View style={{ padding: 16, paddingBottom: insets.bottom + 12 }}>
          <TouchableOpacity style={styles.postBtn} onPress={postStatus} disabled={posting}>
            {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postBtnText}>Publish Story</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mode === "media") {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => showEditorTool("Add music")} style={styles.editorIconBtn}><Ionicons name="musical-notes-outline" size={21} color="#fff" /></TouchableOpacity>
          <TouchableOpacity onPress={() => showEditorTool("Stickers")} style={styles.editorIconBtn}><Ionicons name="happy-outline" size={21} color="#fff" /></TouchableOpacity>
          <TouchableOpacity onPress={() => showEditorTool("Text")} style={styles.editorTextBtn}><Text style={styles.editorTextBtnLabel}>Aa</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => showEditorTool("Draw")} style={styles.editorIconBtn}><Ionicons name="pencil" size={20} color="#fff" /></TouchableOpacity>
          <TouchableOpacity onPress={openCamera} style={styles.iconBtn}><Ionicons name="camera-outline" size={24} color="#fff" /></TouchableOpacity>
          <TouchableOpacity onPress={pickMedia} style={styles.iconBtn}><Ionicons name="images-outline" size={24} color="#fff" /></TouchableOpacity>
        </View>
        {mediaUri && mediaType === "video" && (
          <View style={styles.videoTimelineWrap}>
            <View style={styles.videoTimeline}>
              {Array.from({ length: 14 }).map((_, i) => (
                <View key={i} style={styles.videoFrame}>
                  <Ionicons name="videocam" size={13} color="rgba(255,255,255,0.9)" />
                </View>
              ))}
              <View style={styles.trimHandleLeft} />
              <View style={styles.trimHandleRight} />
            </View>
            <View style={styles.mediaMetaRow}>
              <Ionicons name="volume-high-outline" size={14} color="#fff" />
              <Text style={styles.mediaMetaText}>{mediaDurationLabel}{mediaSizeLabel ? ` · ${mediaSizeLabel}` : ""}</Text>
            </View>
          </View>
        )}
        {mediaUri ? (
          <View style={styles.mediaPreview}>
            {mediaType === "video" ? <VideoPreview uri={mediaUri} /> : <Image source={{ uri: mediaUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />}
          </View>
        ) : (
          <View style={[styles.mediaPreview, { alignItems: "center", justifyContent: "center" }]}>
            <TouchableOpacity onPress={pickMedia} style={styles.pickMediaBtn}>
              <Ionicons name="images-outline" size={40} color="#fff" />
              <Text style={styles.pickMediaText}>Choose photo or video</Text>
            </TouchableOpacity>
          </View>
        )}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.captionBar, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.statusAudiencePill}>
              <Ionicons name="link-outline" size={13} color="#d9fdd3" />
              <Text style={styles.statusAudienceText}>Status (Contacts)</Text>
            </View>
            <View style={[styles.captionInput, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
              <Ionicons name="happy-outline" size={22} color="rgba(255,255,255,0.7)" />
              <TextInput value={caption} onChangeText={setCaption} placeholder="Add a caption..." placeholderTextColor="rgba(255,255,255,0.5)" style={styles.captionText} multiline />
            </View>
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: "#00A884" }]} onPress={proceedToAudience}><Ionicons name="arrow-forward" size={22} color="#fff" /></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.iconBtn} onPress={() => setFontIdx((i) => (i + 1) % fonts.length)}><Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>{fontLabels[fontIdx]}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.textColorBtn, { backgroundColor: textColor, borderColor: textColor === "#FFFFFF" ? "rgba(255,255,255,0.4)" : "transparent" }]} onPress={() => setTextColor((tc) => TEXT_COLORS[(TEXT_COLORS.indexOf(tc) + 1) % TEXT_COLORS.length])} />
        <TouchableOpacity onPress={() => { setMode("media"); pickMedia(); }} style={styles.iconBtn}><Ionicons name="image-outline" size={24} color="#fff" /></TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity style={styles.textArea} activeOpacity={1} onPress={() => inputRef.current?.focus()}>
          <TextInput ref={inputRef} value={text} onChangeText={setText} placeholder="Type a story..." placeholderTextColor={`${textColor}80`} style={[styles.textInput, { color: textColor, fontFamily: fonts[fontIdx] }]} multiline textAlignVertical="center" textAlign="center" maxLength={700} />
        </TouchableOpacity>
      </KeyboardAvoidingView>
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorPalette}>
          {TEXT_BG_COLORS.map((c) => (
            <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, bgColor === c && styles.colorDotSelected]} onPress={() => { setBgColor(c); Haptics.selectionAsync(); }} />
          ))}
        </ScrollView>
        <TouchableOpacity style={[styles.postBtn, { backgroundColor: text.trim() ? "#00A884" : "rgba(255,255,255,0.3)" }]} onPress={proceedToAudience} disabled={!text.trim()}>
          <Text style={styles.postBtnText}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      {text.length > 0 && <Text style={[styles.charCount, { color: `${textColor}80` }]}>{700 - text.length}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, gap: 4 },
  iconBtn: { padding: 10 },
  editorIconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  editorTextBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  editorTextBtnLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
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
  videoTimelineWrap: { paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  videoTimeline: { height: 42, borderRadius: 4, overflow: "hidden", borderWidth: 2, borderColor: "#fff", flexDirection: "row", backgroundColor: "#111" },
  videoFrame: { flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "rgba(255,255,255,0.28)", backgroundColor: "#1F2937" },
  trimHandleLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: 7, backgroundColor: "#fff" },
  trimHandleRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: 7, backgroundColor: "#fff" },
  mediaMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  mediaMetaText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  mediaPreview: { flex: 1, width: W },
  captionBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 8, gap: 10, flexWrap: "wrap" },
  statusAudiencePill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(17,27,33,0.92)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 },
  statusAudienceText: { color: "#d9fdd3", fontSize: 11, fontWeight: "600" },
  captionInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, minHeight: 48 },
  captionText: { flex: 1, color: "#fff", fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  pickMediaBtn: { alignItems: "center", gap: 16 },
  pickMediaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  audienceHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  audienceTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  audienceSub: { color: "#9db0b8", fontSize: 12, marginTop: 2 },
  audienceCard: { backgroundColor: "#1F2C34", borderRadius: 14, marginHorizontal: 14, marginTop: 10, padding: 12 },
  settingLabel: { color: "#dfe8eb", fontSize: 13, fontWeight: "700", marginBottom: 8 },
  settingInput: { backgroundColor: "#2A3942", color: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: "#3f515b" },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  modeBtn: { flex: 1, backgroundColor: "#2A3942", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#3f515b" },
  modeBtnActive: { borderColor: "#00A884", backgroundColor: "#00A88422" },
  modeBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  searchWrap: { marginTop: 8, backgroundColor: "#2A3942", borderRadius: 10, borderWidth: 1, borderColor: "#3f515b", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  searchInput: { color: "#fff", flex: 1, fontSize: 14, paddingVertical: 10 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: "#00A884" },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  limitHint: { color: "#91a3ab", marginTop: 8, fontSize: 12 },
  membersList: { marginTop: 8, maxHeight: 150 },
  memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#39515d" },
  memberName: { color: "#fff", fontSize: 14, fontWeight: "500" },
});
