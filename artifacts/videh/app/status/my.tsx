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
import { DropdownMenu } from "@/components/DropdownMenu";

const BOOST_BASE_PRICE_INR = 499;
const BOOST_DAY_PRICE_INR = 299;
const BOOST_RADIUS_PRICE_INR = 12;
const BOOST_CITY_PRICE_INR = 350;
const BOOST_STATE_PRICE_INR = 700;

type RazorpaySuccess = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayCheckoutModule = {
  open: (options: Record<string, unknown>) => Promise<RazorpaySuccess>;
};

function getRazorpayCheckout(): RazorpayCheckoutModule | null {
  if (Platform.OS === "web") return null;
  try {
    // Static require is important so Metro includes the native module in APK builds.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-razorpay") as { default?: RazorpayCheckoutModule; open?: RazorpayCheckoutModule["open"] };
    return (mod.default ?? mod) as RazorpayCheckoutModule;
  } catch {
    return null;
  }
}

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
  const [menuStatus, setMenuStatus] = useState<Status | null>(null);

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
        headers: {
          "Content-Type": "application/json",
          ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
        },
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
        order?: { id: string; amount?: number; currency?: string };
        keyId?: string;
      };
      if (!orderData.success || !orderData.order?.id || !orderData.keyId) throw new Error(orderData.message);

      const checkout = getRazorpayCheckout();
      if (!checkout) {
        Alert.alert("Payment unavailable", "Razorpay Checkout is not available in this build. Please install the latest APK build and try again.");
        return;
      }

      const payment = await checkout.open({
        key: orderData.keyId,
        order_id: orderData.order.id,
        amount: orderData.order.amount ?? boostPlan.amountInr * 100,
        currency: orderData.order.currency ?? "INR",
        name: "Videh",
        description: "Story boost payment",
        prefill: {
          name: user.name ?? "Videh user",
          contact: user.phone ?? "",
        },
        theme: { color: colors.primary },
      });

      if (!payment.razorpay_payment_id || !payment.razorpay_order_id || !payment.razorpay_signature) {
        throw new Error("Payment response is incomplete.");
      }

      const verifyRes = await fetch(`${getApiUrl()}/api/statuses/${boostTarget.id}/boost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
        },
        body: JSON.stringify({
          userId: user.dbId,
          amountInr: boostPlan.amountInr,
          durationDays: boostPlan.durationDays,
          radiusKm: boostPlan.radiusKm,
          targetCity: targetCity.trim(),
          targetState: targetState.trim(),
          razorpayOrderId: payment.razorpay_order_id,
          razorpayPaymentId: payment.razorpay_payment_id,
          razorpaySignature: payment.razorpay_signature,
        }),
      });
      const verifyData = await verifyRes.json() as { success?: boolean; message?: string };
      if (!verifyData.success) throw new Error(verifyData.message);

      setBoostedIds((prev) => prev.includes(boostTarget.id) ? prev : [...prev, boostTarget.id]);
      setBoostTarget(null);
      Alert.alert("Payment successful", "Your story boost has been sent to admin for verification. It will start after approval.");
    } catch {
      Alert.alert("Boost failed", "Could not submit this boost. Please try again.");
    } finally {
      setBoostingId(null);
    }
  };

  const showBoostAnalytics = async (status: Status) => {
    if (!user?.dbId) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/statuses/${status.id}/boost/analytics?ownerId=${user.dbId}`, {
        headers: user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : undefined,
      });
      const data = await res.json() as { success?: boolean; boostedViewCount?: number; viewers?: Array<{ name: string }> };
      if (!data.success) throw new Error("No analytics");
      const names = (data.viewers ?? []).slice(0, 20).map((v) => `• ${v.name}`).join("\n");
      Alert.alert("Boost views", `Views after boost: ${data.boostedViewCount ?? 0}${names ? `\n\n${names}` : ""}`);
    } catch {
      Alert.alert("No boost analytics", "Analytics will be available after the boost is approved.");
    }
  };

  const openMenu = (status: Status) => {
    setMenuStatus(status);
  };

  const openBoostOrAnalytics = (status: Status) => {
    if (status.boostStatus === "rejected") {
      Alert.alert("Boost rejected", status.boostVerificationNote || "Admin rejected this story boost request.");
      return;
    }
    if (status.isBoosted || boostedIds.includes(status.id)) {
      void showBoostAnalytics(status);
      return;
    }
    openBoostSheet(status);
  };

  const menuItems = menuStatus ? [
    { label: "Forward", icon: "arrow-redo-outline", onPress: () => { void shareStatus(menuStatus, "Forwarded status"); } },
    { label: "Save", icon: "download-outline", onPress: () => { void shareStatus(menuStatus, "Save this status"); } },
    { label: "Share", icon: "share-social-outline", onPress: () => { void shareStatus(menuStatus); } },
    { label: "Share to Facebook", icon: "logo-facebook", onPress: () => { void shareStatus(menuStatus, "Facebook"); } },
    { label: "Share to Instagram", icon: "logo-instagram", onPress: () => { void shareStatus(menuStatus, "Instagram"); } },
    {
      label: "Delete",
      icon: "trash-outline",
      danger: true,
      onPress: async () => {
        setBusyId(menuStatus.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await deleteStatus(menuStatus.id);
        setBusyId(null);
      },
    },
  ] : [];

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
                {(item.isBoosted || boostedIds.includes(item.id) || item.boostStatus === "pending_verification" || item.boostStatus === "rejected") && (
                  <View style={[styles.boostBadge, item.boostStatus === "rejected" && styles.boostRejectedBadge, item.boostStatus === "pending_verification" && styles.boostPendingBadge]}>
                    <Ionicons
                      name={item.boostStatus === "rejected" ? "close-circle" : item.boostStatus === "pending_verification" ? "time" : "flash"}
                      size={12}
                      color="#111B21"
                    />
                    <Text style={styles.boostBadgeText}>
                      {item.boostStatus === "rejected" ? "Boost rejected" : item.boostStatus === "pending_verification" ? "Pending verification" : "Boosted"}
                    </Text>
                  </View>
                )}
                {item.boostStatus === "rejected" && item.boostVerificationNote ? (
                  <Text style={styles.rejectNote} numberOfLines={2}>Reason: {item.boostVerificationNote}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.boostTextBtn, { borderColor: colors.primary }]}
              onPress={() => openBoostOrAnalytics(item)}
              disabled={busyId === item.id || boostingId === item.id}
              activeOpacity={0.72}
            >
              <Text style={[styles.boostTextBtnLabel, { color: colors.primary }]}>
                {item.boostStatus === "rejected" ? "View reason" : item.isBoosted || boostedIds.includes(item.id) ? "Analytics" : "Boost story"}
              </Text>
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
      <DropdownMenu
        visible={Boolean(menuStatus)}
        onClose={() => setMenuStatus(null)}
        items={menuItems}
        topOffset={topPad + 54}
      />
      <Modal visible={Boolean(boostTarget)} transparent animationType="slide" onRequestClose={() => setBoostTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.boostSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.boostHeader}>
              <View>
                <Text style={styles.boostTitle}>Boost story</Text>
                <Text style={styles.boostSub}>After payment, this request goes to admin verification. The boost starts only after approval.</Text>
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
                Boosted stories do not expire after 24 hours. After admin approval, this story will stay boosted for {boostPlan.durationDays} day(s).
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
  boostPendingBadge: { backgroundColor: "#38BDF8" },
  boostRejectedBadge: { backgroundColor: "#FB7185" },
  boostBadgeText: { color: "#111B21", fontSize: 11, fontFamily: "Inter_700Bold" },
  rejectNote: { color: "#FB7185", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 4 },
  boostTextBtn: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 8 },
  boostTextBtnLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
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
