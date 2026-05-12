import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, type Status } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

const BOOST_BASE_PRICE_INR = 499;
const BOOST_DAY_PRICE_INR = 299;
const BOOST_RADIUS_PRICE_INR = 12;
const BOOST_CITY_PRICE_INR = 350;
const BOOST_STATE_PRICE_INR = 700;

function clampInt(raw: string, min: number, max: number) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function MyStatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { statuses, deleteStatus, user } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [boostingId, setBoostingId] = useState<string | null>(null);
  const [boostedIds, setBoostedIds] = useState<string[]>([]);
  const [boostTarget, setBoostTarget] = useState<Status | null>(null);
  const [targetState, setTargetState] = useState("");
  const [targetCity, setTargetCity] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [durationDays, setDurationDays] = useState("3");

  const myStatuses = useMemo(
    () => statuses.filter((s) => s.userId === "me").sort((a, b) => b.timestamp - a.timestamp),
    [statuses]
  );

  const boostPlan = useMemo(() => {
    const days = clampInt(durationDays, 1, 30);
    const radius = clampInt(radiusKm, 5, 500);
    const amountInr =
      BOOST_BASE_PRICE_INR +
      days * BOOST_DAY_PRICE_INR +
      radius * BOOST_RADIUS_PRICE_INR +
      (targetCity.trim() ? BOOST_CITY_PRICE_INR : 0) +
      (targetState.trim() ? BOOST_STATE_PRICE_INR : 0);
    const estimatedReach = Math.round(1200 + days * 1800 + radius * 95 + (targetCity.trim() ? 2500 : 0) + (targetState.trim() ? 5000 : 0));
    return { amountInr, durationDays: days, radiusKm: radius, estimatedReach };
  }, [durationDays, radiusKm, targetCity, targetState]);

  const shareStatus = async (status: Status, channelLabel?: string) => {
    const text = status.content?.trim() || "Shared from my Videh status";
    const payload = status.mediaUrl
      ? { message: channelLabel ? `${channelLabel}\n${text}` : text, url: status.mediaUrl }
      : { message: channelLabel ? `${channelLabel}\n${text}` : text };
    await Share.share(payload).catch(() => {});
  };

  const openBoostSheet = (status: Status) => {
    setBoostTarget(status);
  };

  const submitBoost = async () => {
    if (!boostTarget || !user?.dbId) return;
    setBoostingId(boostTarget.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const orderRes = await fetch(`${getApiUrl()}/api/statuses/${boostTarget.id}/boost/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.dbId,
          durationDays: boostPlan.durationDays,
          radiusKm: boostPlan.radiusKm,
          targetCity: targetCity.trim(),
          targetState: targetState.trim(),
        }),
      });
      const orderData = await orderRes.json() as {
        success?: boolean;
        message?: string;
        order?: { id: string };
        keyId?: string;
      };
      if (!orderData.success || !orderData.order?.id) throw new Error(orderData.message);
      Alert.alert(
        "Razorpay order ready",
        `Order: ${orderData.order.id}\nAmount: ₹${boostPlan.amountInr}\n\nNext step: open Razorpay Checkout and send payment_id + signature for verification. Boost will go to admin only after payment is verified.`,
      );
    } catch {
      Alert.alert("Boost failed", "Could not submit this boost. Please try again.");
    } finally {
      setBoostingId(null);
    }
  };

  const showBoostAnalytics = async (status: Status) => {
    if (!user?.dbId) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/statuses/${status.id}/boost/analytics?ownerId=${user.dbId}`);
      const data = await res.json() as { success?: boolean; boostedViewCount?: number; viewers?: Array<{ name: string }> };
      if (!data.success) throw new Error("No analytics");
      const names = (data.viewers ?? []).slice(0, 20).map((v) => `• ${v.name}`).join("\n");
      Alert.alert("Boost views", `Boost ke baad views: ${data.boostedViewCount ?? 0}${names ? `\n\n${names}` : ""}`);
    } catch {
      Alert.alert("No boost analytics", "Analytics boost approval ke baad available hogi.");
    }
  };

  const openMenu = (status: Status) => {
    Alert.alert("Status options", "Choose action", [
      {
        text: status.isBoosted || boostedIds.includes(status.id) ? "Boost analytics" : "Boost story",
        onPress: () => {
          if (status.isBoosted || boostedIds.includes(status.id)) void showBoostAnalytics(status);
          else openBoostSheet(status);
        },
      },
      { text: "Forward", onPress: () => { void shareStatus(status, "Forwarded status"); } },
      { text: "Save", onPress: () => { void shareStatus(status, "Save this status"); } },
      { text: "Share...", onPress: () => { void shareStatus(status); } },
      { text: "Share to Facebook", onPress: () => { void shareStatus(status, "Facebook"); } },
      { text: "Share to Instagram", onPress: () => { void shareStatus(status, "Instagram"); } },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(status.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await deleteStatus(status.id);
          setBusyId(null);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My status</Text>
      </View>

      <FlatList
        data={myStatuses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
              onPress={() => router.push({ pathname: "/status/view", params: { ids: myStatuses.map((s) => s.id).join(","), id: item.id } })}
            >
              {item.mediaUrl ? (
                <Image source={{ uri: item.mediaUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.textThumb]}>
                  <Ionicons name="document-text-outline" size={20} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.content || (item.type === "video" ? "Video status" : item.type === "image" ? "Photo status" : "Text status")}
                </Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  {new Date(item.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Text>
                {(item.isBoosted || boostedIds.includes(item.id)) && (
                  <View style={styles.boostBadge}>
                    <Ionicons name="flash" size={12} color="#111B21" />
                    <Text style={styles.boostBadgeText}>Boosted</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuBtn} onPress={() => openMenu(item)} disabled={busyId === item.id || boostingId === item.id}>
              <Ionicons name={boostingId === item.id ? "hourglass-outline" : "ellipsis-vertical"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="radio-button-on-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No status updates yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      />
      <Modal visible={Boolean(boostTarget)} transparent animationType="slide" onRequestClose={() => setBoostTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.boostSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.boostHeader}>
              <View>
                <Text style={styles.boostTitle}>Boost story</Text>
                <Text style={styles.boostSub}>Payment ke baad admin verification. Approval ke baad boost start hoga.</Text>
              </View>
              <TouchableOpacity onPress={() => setBoostTarget(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.boostForm}>
              <View style={styles.priceCard}>
                <Text style={styles.priceLabel}>Estimated price</Text>
                <Text style={styles.priceValue}>₹{boostPlan.amountInr}</Text>
                <Text style={styles.priceHint}>Reach approx {boostPlan.estimatedReach.toLocaleString("en-IN")} people</Text>
              </View>
              <View style={styles.formRow}>
                <Text style={styles.inputLabel}>Target state</Text>
                <TextInput value={targetState} onChangeText={setTargetState} placeholder="e.g. Bihar" placeholderTextColor="#88a0aa" style={styles.boostInput} />
              </View>
              <View style={styles.formRow}>
                <Text style={styles.inputLabel}>Target city</Text>
                <TextInput value={targetCity} onChangeText={setTargetCity} placeholder="e.g. Patna" placeholderTextColor="#88a0aa" style={styles.boostInput} />
              </View>
              <View style={styles.formGrid}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Radius (km)</Text>
                  <TextInput value={radiusKm} onChangeText={setRadiusKm} keyboardType="number-pad" placeholder="25" placeholderTextColor="#88a0aa" style={styles.boostInput} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Days</Text>
                  <TextInput value={durationDays} onChangeText={setDurationDays} keyboardType="number-pad" placeholder="3" placeholderTextColor="#88a0aa" style={styles.boostInput} />
                </View>
              </View>
              <Text style={styles.policyText}>
                Boosted story 24 hours me expire nahi hogi. Admin approve karega to story {boostPlan.durationDays} day(s) tak boosted chalegi.
              </Text>
              <TouchableOpacity style={styles.payBtn} onPress={submitBoost} disabled={Boolean(boostingId)}>
                {boostingId ? <ActivityIndicator color="#111B21" /> : <Text style={styles.payBtnText}>Pay ₹{boostPlan.amountInr} & send for verification</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingBottom: 10 },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 30, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#0f172a" },
  textThumb: { alignItems: "center", justifyContent: "center", backgroundColor: "#00A884" },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  boostBadge: { marginTop: 6, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FACC15", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  boostBadgeText: { color: "#111B21", fontSize: 11, fontFamily: "Inter_700Bold" },
  menuBtn: { padding: 8 },
  empty: { alignItems: "center", paddingTop: 70, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  boostSheet: { backgroundColor: "#111B21", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  boostHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2A3942", gap: 12 },
  boostTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  boostSub: { color: "#9db0b8", fontSize: 12, marginTop: 4, maxWidth: 280 },
  closeBtn: { padding: 6 },
  boostForm: { padding: 16, gap: 14 },
  priceCard: { backgroundColor: "#00A88422", borderWidth: 1, borderColor: "#00A88455", borderRadius: 16, padding: 14 },
  priceLabel: { color: "#b8d9d0", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  priceValue: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold", marginTop: 4 },
  priceHint: { color: "#d9fdd3", fontSize: 13, marginTop: 4 },
  formRow: { gap: 6 },
  formGrid: { flexDirection: "row", gap: 12 },
  inputLabel: { color: "#dfe8eb", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  boostInput: { backgroundColor: "#2A3942", color: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: "#3f515b", fontSize: 15 },
  policyText: { color: "#9db0b8", fontSize: 12, lineHeight: 18 },
  payBtn: { backgroundColor: "#FACC15", borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 2 },
  payBtnText: { color: "#111B21", fontSize: 15, fontFamily: "Inter_700Bold" },
});
