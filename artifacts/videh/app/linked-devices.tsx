import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
})();

export default function LinkedDevicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const handleBarcode = async ({ data }: { data: string }) => {
    if (hasScannedRef.current || linking) return;

    // Parse videh://scan?token=XXX&host=YYY
    if (!data.startsWith("videh://scan")) {
      Alert.alert("Invalid QR", "This QR code is not for Videh Web. Open videh.app and scan the QR shown there.");
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
        setLinked(true);
        setLinking(false);
        setTimeout(() => router.back(), 2500);
      } else {
        throw new Error(result.message ?? "Link failed");
      }
    } catch (err: unknown) {
      setLinking(false);
      hasScannedRef.current = false;
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Link failed", msg === "Session not found or expired" ? "The QR code has expired. Please refresh Videh Web and try again." : msg);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Linked devices</Text>
      </View>

      {linked ? (
        /* Success state */
        <View style={styles.center}>
          <View style={[styles.successCircle, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark" size={48} color="#fff" />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>Device linked!</Text>
          <Text style={[styles.successSub, { color: colors.textSecondary }]}>
            Videh Web is now connected to your account.
          </Text>
        </View>
      ) : !scanning ? (
        /* Intro state */
        <View style={styles.intro}>
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="laptop-outline" size={64} color={colors.primary} />
          </View>

          <Text style={[styles.introTitle, { color: colors.text }]}>Use Videh on your computer</Text>
          <Text style={[styles.introSub, { color: colors.textSecondary }]}>
            Open{" "}
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              videh.app
            </Text>
            {" "}in your browser, then tap the button below to scan the QR code shown on screen.
          </Text>

          {/* Steps */}
          {[
            { icon: "globe-outline", text: "Go to videh.app in any browser" },
            { icon: "qr-code-outline", text: "A QR code will appear on screen" },
            { icon: "phone-portrait-outline", text: "Tap the button below to scan it" },
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepIconBg, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name={step.icon as "globe-outline"} size={22} color={colors.primary} />
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{step.text}</Text>
            </View>
          ))}

          {!permission?.granted ? (
            <TouchableOpacity style={[styles.scanBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.scanBtnText}>Allow Camera Access</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.scanBtn, { backgroundColor: colors.primary }]}
              onPress={() => { hasScannedRef.current = false; setScanning(true); }}
            >
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
              <Text style={styles.scanBtnText}>Scan QR code</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* Camera scanning state */
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={linking ? undefined : handleBarcode}
          />

          {/* Overlay */}
          <View style={styles.overlay}>
            <View style={styles.overlayTop} />
            <View style={styles.overlayRow}>
              <View style={styles.overlaySide} />
              <View style={styles.scanWindow}>
                {/* Corner marks */}
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
              <Text style={styles.cameraHint}>
                Point camera at the QR code on Videh Web
              </Text>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanning(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  intro: { flex: 1, padding: 28, alignItems: "center" },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    marginTop: 8,
  },
  introTitle: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  introSub: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  step: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16, alignSelf: "stretch" },
  stepIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 15, flex: 1 },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    marginTop: 28,
  },
  scanBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cameraContainer: { flex: 1, position: "relative" },
  overlay: { flex: 1 },
  overlayTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
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
  overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "flex-start", paddingTop: 28, gap: 16 },
  cameraHint: { color: "rgba(255,255,255,0.85)", fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 24, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" },
  cancelBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  successCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontWeight: "700" },
  successSub: { fontSize: 15, textAlign: "center", lineHeight: 22 },
});
