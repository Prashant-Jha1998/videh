import { Image } from "expo-image";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import {
  encodeLocationPayload,
  formatLiveUntil,
  mapsUrl,
  staticMapImageUrl,
  type LocationMessagePayload,
} from "@/lib/locationMessage";

const API_BASE = getApiUrl();
const { width: SW } = Dimensions.get("window");
const MAP_H = Math.round(SW * 0.42);

const DURATIONS = [
  { label: "15 minutes", ms: 15 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "8 hours", ms: 8 * 60 * 60 * 1000 },
] as const;

export default function SendLocationScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, loadMessages, startLiveLocationSession } = useApp();

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState("");
  const [nearbyRows, setNearbyRows] = useState<{ title: string; subtitle: string }[]>([]);

  const [liveIntroOpen, setLiveIntroOpen] = useState(false);
  const [livePanelOpen, setLivePanelOpen] = useState(false);
  const [durationIdx, setDurationIdx] = useState(1);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const mapUri = lat != null && lng != null ? staticMapImageUrl(lat, lng, Math.round(SW * 2), MAP_H * 2, 15) : null;

  const refreshPosition = useCallback(async () => {
    setErr(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErr("Location permission is required.");
        setLoading(false);
        return;
      }
      if (Platform.OS === "android") {
        await Location.enableNetworkProviderAsync().catch(() => {});
      }
      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!loc) {
        const last = await Location.getLastKnownPositionAsync();
        if (last) loc = last;
      }
      if (!loc) {
        setErr("Could not get your location.");
        setLoading(false);
        return;
      }
      const { latitude, longitude } = loc.coords;
      setLat(latitude);
      setLng(longitude);
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => [] as Location.LocationGeocodedAddress[]);
      const g = geo[0];
      const label = [g?.name, g?.street, g?.district].filter(Boolean).join(", ") || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      setAreaLabel(label);
      const rows: { title: string; subtitle: string }[] = [];
      if (g?.name && g.name !== label) rows.push({ title: g.name, subtitle: [g.street, g.city].filter(Boolean).join(" · ") });
      if (g?.street) rows.push({ title: g.street, subtitle: [g.city, g.region].filter(Boolean).join(" · ") });
      if (g?.city && !rows.some((r) => r.title === g.city)) rows.push({ title: g.city ?? "Area", subtitle: g.region ?? "" });
      setNearbyRows(rows.slice(0, 6));
    } catch {
      setErr("Could not refresh location.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPosition();
  }, [refreshPosition]);

  const postLocation = async (payload: LocationMessagePayload) => {
    if (!chatId || !user?.dbId) return null;
    const content = encodeLocationPayload(payload);
    const url = mapsUrl(payload.lat, payload.lng);
    const res = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: user.dbId, content, type: "location", mediaUrl: url }),
    });
    const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
    if (res.status === 403) {
      const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
      Alert.alert("Cannot send message", msg);
      return null;
    }
    if (data?.success && data.message && typeof data.message === "object" && data.message.id != null) {
      return String(data.message.id);
    }
    return null;
  };

  const sendStatic = async (label?: string) => {
    if (lat == null || lng == null || !chatId) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload: LocationMessagePayload = {
        v: 1,
        mode: "static",
        lat,
        lng,
        label: label ?? areaLabel,
      };
      await postLocation(payload);
      await loadMessages(chatId);
      router.back();
    } finally {
      setSending(false);
    }
  };

  const sendLive = async () => {
    if (lat == null || lng == null || !chatId) return;
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const until = Date.now() + DURATIONS[durationIdx].ms;
    const payload: LocationMessagePayload = {
      v: 1,
      mode: "live",
      lat,
      lng,
      until,
      comment: comment.trim() || undefined,
      label: areaLabel,
    };
    try {
      const mid = await postLocation(payload);
      await loadMessages(chatId);
      setLivePanelOpen(false);
      if (mid) startLiveLocationSession({ chatId, messageId: mid, untilMs: until, comment: comment.trim() || undefined });
      router.back();
    } finally {
      setSending(false);
    }
  };

  const topPad = insets.top + (Platform.OS === "web" ? 8 : 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Send location</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => {}} hitSlop={12}>
            <Ionicons name="search-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => void refreshPosition()} hitSlop={12}>
            <Ionicons name="refresh" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 24 }}>{err}</Text>
          <TouchableOpacity onPress={() => void refreshPosition()}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.mapWrap}>
            {mapUri ? (
              <Image source={{ uri: mapUri }} style={styles.mapImg} contentFit="cover" />
            ) : null}
            <View style={styles.mapOverlayRow}>
              <TouchableOpacity style={styles.mapFab} onPress={() => {}}>
                <Ionicons name="scan-outline" size={20} color="#555" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.mapFab} onPress={() => void refreshPosition()}>
                <Ionicons name="locate" size={22} color="#555" />
              </TouchableOpacity>
            </View>
            <Text style={styles.osmCredit}>© OpenStreetMap</Text>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setLiveIntroOpen(true);
              }}
            >
              <View style={[styles.rowIconCircle, { backgroundColor: "#25D366" }]}>
                <Ionicons name="navigate" size={20} color="#fff" />
              </View>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Share live location</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => void sendStatic()}
              disabled={sending}
            >
              <View style={[styles.rowIconCircle, { backgroundColor: "#8696A0" }]}>
                <Ionicons name="location" size={20} color="#fff" />
              </View>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Send your current location</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>

            <Text style={[styles.sectionHdr, { color: colors.mutedForeground }]}>Nearby places</Text>
            {nearbyRows.map((r, i) => (
              <TouchableOpacity
                key={`${r.title}-${i}`}
                style={[styles.placeRow, { borderBottomColor: colors.border }]}
                onPress={() => void sendStatic(r.title)}
                disabled={sending}
              >
                <Ionicons name="location-outline" size={22} color={colors.mutedForeground} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.placeTitle, { color: colors.foreground }]}>{r.title}</Text>
                  {!!r.subtitle && <Text style={[styles.placeSub, { color: colors.mutedForeground }]}>{r.subtitle}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Live location — intro (WhatsApp-style copy) */}
      <Modal visible={liveIntroOpen} transparent animationType="fade" onRequestClose={() => setLiveIntroOpen(false)}>
        <Pressable style={styles.modalDim} onPress={() => setLiveIntroOpen(false)}>
          <Pressable style={[styles.introCard, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.introIconWrap}>
              <Ionicons name="radio" size={18} color="#25D366" style={{ position: "absolute", left: 0 }} />
              <Ionicons name="location" size={36} color="#25D366" />
              <Ionicons name="radio" size={18} color="#25D366" style={{ position: "absolute", right: 0 }} />
            </View>
            <Text style={[styles.introBody, { color: colors.foreground }]}>
              Members in this chat will see your location in real time. This feature shares your location for the duration you choose even
              if you are not using the app. You can stop sharing at any time.{" "}
              <Text style={styles.learnMore}>Learn more.</Text>
            </Text>
            <View style={styles.introActions}>
              <TouchableOpacity onPress={() => setLiveIntroOpen(false)}>
                <Text style={[styles.introBtn, { color: colors.primary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setLiveIntroOpen(false);
                  setLivePanelOpen(true);
                }}
              >
                <Text style={[styles.introBtn, { color: colors.primary }]}>Continue</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Live — duration + comment + send */}
      <Modal visible={livePanelOpen} transparent animationType="slide" onRequestClose={() => setLivePanelOpen(false)}>
        <View style={styles.liveModalRoot}>
          <Pressable style={styles.attachBackdrop} onPress={() => setLivePanelOpen(false)} />
          <View style={[styles.livePanel, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.liveTitle, { color: colors.foreground }]}>Share live location</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map((d, i) => {
                const sel = i === durationIdx;
                return (
                  <TouchableOpacity
                    key={d.label}
                    style={[
                      styles.durationChip,
                      { backgroundColor: sel ? colors.primary : colors.muted, borderColor: sel ? colors.primary : colors.border },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDurationIdx(i);
                    }}
                  >
                    <Text style={[styles.durationChipTxt, { color: sel ? "#fff" : colors.foreground }]}>
                      {d.label.replace(" minutes", " min")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[styles.commentInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder="Add comment"
              placeholderTextColor={colors.mutedForeground}
              value={comment}
              onChangeText={setComment}
            />
            <TouchableOpacity
              style={[styles.sendFab, { backgroundColor: colors.primary }]}
              onPress={() => void sendLive()}
              disabled={sending || lat == null}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={22} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center", marginRight: 8 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapWrap: { height: MAP_H, backgroundColor: "#dfe6e4", position: "relative" },
  mapImg: { width: "100%", height: "100%" },
  mapOverlayRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mapFab: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  osmCredit: {
    position: "absolute",
    bottom: 6,
    left: 8,
    fontSize: 10,
    color: "rgba(0,0,0,0.45)",
    fontFamily: "Inter_400Regular",
  },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  sectionHdr: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  placeSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalDim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  attachBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  introCard: { borderRadius: 14, padding: 22, elevation: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12 },
  introIconWrap: { alignItems: "center", justifyContent: "center", flexDirection: "row", marginBottom: 18, height: 44 },
  introBody: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  learnMore: { color: "#039BE5", fontFamily: "Inter_500Medium" },
  introActions: { flexDirection: "row", justifyContent: "flex-end", gap: 20, marginTop: 20 },
  introBtn: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  liveModalRoot: { flex: 1, justifyContent: "flex-end" },
  livePanel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  liveTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 16 },
  durationRow: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  durationChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  durationChipTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  commentInput: {
    borderBottomWidth: 1,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  sendFab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
