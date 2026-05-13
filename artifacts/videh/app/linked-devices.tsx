import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

interface Device {
  token: string;
  device_name: string;
  platform: string;
  linked_at: string;
  last_active: string;
}

function platformIcon(platform: string): "logo-windows" | "logo-apple" | "desktop-outline" | "phone-portrait-outline" | "globe-outline" {
  const p = platform.toLowerCase();
  if (p.includes("windows")) return "logo-windows";
  if (p.includes("macos") || p.includes("ios")) return "logo-apple";
  if (p.includes("android")) return "phone-portrait-outline";
  if (p.includes("linux")) return "desktop-outline";
  return "globe-outline";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `Active ${mins} min ago`;
  if (hrs < 24) return `Active ${hrs}h ago`;
  return `Active ${days}d ago`;
}

export default function LinkedDevicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const hasScannedRef = useRef(false);

  const loadDevices = useCallback(async () => {
    const userId = user?.dbId;
    if (!userId) return;
    try {
      const res = await fetch(`${BASE_URL}/api/web-session/user/${userId}/devices`);
      const data = await res.json();
      if (data.success) setDevices(data.devices ?? []);
    } catch {}
    setLoadingDevices(false);
  }, [user?.dbId]);

  useFocusEffect(useCallback(() => {
    loadDevices();
  }, [loadDevices]));

  const handleBarcode = async ({ data }: { data: string }) => {
    if (hasScannedRef.current || linking) return;
    if (!data.startsWith("videh://scan")) {
      Alert.alert("Invalid QR", "This QR code is not for Videh Web. Open web.videh.co.in and scan the QR shown there.");
      return;
    }

    hasScannedRef.current = true;
    setLinking(true);

    try {
      const url = new URL(data.replace("videh://scan", "https://placeholder/scan"));
      const token = url.searchParams.get("token");
      if (!token) throw new Error("No token in QR");
      const userId = user?.dbId;
      if (!userId) throw new Error("Not logged in");

      const res = await fetch(`${BASE_URL}/api/web-session/${token}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const result = await res.json();

      if (result.success) {
        setLinking(false);
        setScanning(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadDevices();
      } else {
        throw new Error(result.message ?? "Link failed");
      }
    } catch (err: unknown) {
      setLinking(false);
      hasScannedRef.current = false;
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Link failed", msg === "Session not found or expired"
        ? "The QR code has expired. Please refresh Videh Web and try again."
        : msg);
    }
  };

  const openScan = () => {
    hasScannedRef.current = false;
    if (!permission?.granted) { requestPermission(); return; }
    setScanning(true);
  };

  // ── CAMERA VIEW ──────────────────────────────────────────────────────────
  if (scanning) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={linking ? undefined : handleBarcode}
        />
        <View style={styles.overlay}>
          <View style={[styles.overlayTop, { paddingTop: insets.top + 10, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }]}>
            <TouchableOpacity onPress={() => setScanning(false)} style={{ padding: 8 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", marginLeft: 8 }}>Scan QR code</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
          <View style={styles.overlayRow}>
            <View style={styles.overlaySide} />
            <View style={styles.scanWindow}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {linking && (
                <View style={styles.scanningIndicator}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.scanningText}>Linking device...</Text>
                </View>
              )}
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.cameraHint}>Point camera at the QR code on Videh Web</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── MAIN LIST SCREEN ─────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Linked devices</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* WhatsApp-style guide */}
        <View style={styles.guideWrap}>
          {/* Laptop illustration */}
          <View style={[styles.illustrationCircle, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="laptop-outline" size={52} color={colors.primary} />
          </View>

          <Text style={[styles.guideTitle, { color: colors.text }]}>Use Videh on your computer</Text>
          <Text style={[styles.guideSubtitle, { color: colors.mutedForeground }]}>
            Open <Text style={{ color: colors.primary }}>web.videh.co.in</Text> in your browser, then tap the button below to scan the QR code shown on screen.
          </Text>

          {/* 3 steps */}
          {[
            { icon: "globe-outline" as const, text: "Go to web.videh.co.in in any browser" },
            { icon: "qr-code-outline" as const, text: "A QR code will appear on screen" },
            { icon: "phone-portrait-outline" as const, text: "Tap the button below to scan it" },
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepIconBg, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name={step.icon} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.stepText, { color: colors.mutedForeground }]}>{step.text}</Text>
            </View>
          ))}
        </View>

        {/* Scan QR code button */}
        <TouchableOpacity
          style={[styles.linkBtn, { backgroundColor: colors.primary }]}
          onPress={openScan}
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={20} color="#fff" />
          <Text style={styles.linkBtnText}>Scan QR code</Text>
        </TouchableOpacity>

        {/* Device list */}
        {loadingDevices ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : devices.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DEVICE STATUS</Text>
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
              Tap a device to rename it or log out.
            </Text>

            <View style={[styles.deviceList, { backgroundColor: colors.card }]}>
              {devices.map((device, idx) => (
                <TouchableOpacity
                  key={device.token}
                  style={[
                    styles.deviceRow,
                    idx < devices.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                  onPress={() => router.push({ pathname: "/device-detail", params: { token: device.token, deviceName: device.device_name, platform: device.platform, linkedAt: device.linked_at, lastActive: device.last_active } })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.deviceIconBg, { backgroundColor: colors.primary }]}>
                    <Ionicons name={platformIcon(device.platform)} size={22} color="#fff" />
                  </View>
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceName, { color: colors.text }]} numberOfLines={1}>{device.device_name}</Text>
                    <Text style={[styles.deviceStatus, { color: colors.primary }]}>{timeAgo(device.last_active ?? device.linked_at)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {/* Encryption notice */}
        <View style={styles.encryptionRow}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.encryptionText, { color: colors.mutedForeground }]}>
            Your personal messages are{" "}
            <Text style={{ color: "#00a884", fontWeight: "700" }}>end-to-end encrypted</Text>
            {" "}on all your devices.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  guideWrap: { margin: 24, marginBottom: 12, alignItems: "center", gap: 16 },
  illustrationCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  guideTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  guideSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 14, width: "100%", paddingHorizontal: 4 },
  stepIconBg: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepText: { fontSize: 14, flex: 1, lineHeight: 19 },
  linkBtn: { marginHorizontal: 24, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 28 },
  linkBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  loadingRow: { padding: 24, alignItems: "center" },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginTop: 20, marginBottom: 4, marginHorizontal: 16 },
  sectionHint: { fontSize: 12, marginHorizontal: 16, marginBottom: 10 },
  deviceList: { marginHorizontal: 16, borderRadius: 12, overflow: "hidden" },
  deviceRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 14 },
  deviceIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { fontSize: 16, fontWeight: "600" },
  deviceStatus: { fontSize: 13 },
  encryptionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 20, marginTop: 28, paddingHorizontal: 8 },
  encryptionText: { fontSize: 13, flex: 1, lineHeight: 18 },
  // Camera
  overlay: { flex: 1 },
  overlayTop: { backgroundColor: "rgba(0,0,0,0.6)" },
  overlayRow: { flexDirection: "row", height: 260 },
  overlaySide: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  scanWindow: { width: 260, position: "relative" },
  corner: { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderColor: "#00a884" },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: 4 },
  scanningIndicator: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  scanningText: { color: "#fff", fontWeight: "600" },
  overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "flex-start", paddingTop: 28 },
  cameraHint: { color: "rgba(255,255,255,0.85)", fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
});
