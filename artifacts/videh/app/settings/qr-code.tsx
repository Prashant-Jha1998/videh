import { Ionicons } from "@expo/vector-icons";
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VidehQrCode } from "@/components/VidehQrCode";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  buildVidehContactQrValue,
  resolveVidehContactFromQr,
} from "@/lib/videhContactQr";
import { normalizePhone } from "@/lib/videhContacts";

type Tab = "my" | "scan";

export default function QrCodeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, chats } = useApp();
  const [tab, setTab] = useState<Tab>("my");
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn, setTorchOn] = useState(false);
  const [resolving, setResolving] = useState(false);
  const scannedRef = useRef(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const initials = (user?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (user?.name?.charCodeAt(0) ?? 65) * 37 % 360;
  const avatarBg = `hsl(${hue},48%,42%)`;

  const qrValue = useMemo(
    () =>
      buildVidehContactQrValue({
        userId: user?.dbId,
        phone: user?.phone ? normalizePhone(user.phone) : undefined,
        name: user?.name,
      }),
    [user?.dbId, user?.name, user?.phone],
  );

  const openChatForContact = useCallback(
    async (userId: number, name: string, avatarUrl?: string) => {
      if (user?.dbId && userId === user.dbId) {
        Alert.alert("Your QR code", "This is your own contact code.");
        return;
      }
      const existing = chats.find((c) => !c.isGroup && c.otherUserId === userId);
      if (existing) {
        router.replace({ pathname: "/chat/[id]", params: { id: existing.id, name } });
        return;
      }
      router.replace({
        pathname: "/chat/[id]",
        params: {
          id: `new_${userId}`,
          name,
          otherUserId: String(userId),
          otherAvatar: avatarUrl ?? "",
        },
      });
    },
    [chats, router, user?.dbId],
  );

  const handleScanData = useCallback(
    async (data: string) => {
      if (scannedRef.current || resolving) return;
      if (data.startsWith("videh://scan")) {
        Alert.alert(
          "Web device QR",
          "This code is for linking Videh Web. Open Linked devices to scan it.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open", onPress: () => router.push("/linked-devices") },
          ],
        );
        return;
      }

      scannedRef.current = true;
      setResolving(true);
      try {
        const contact = await resolveVidehContactFromQr(data, user?.sessionToken);
        if (!contact) {
          Alert.alert("Invalid QR", "Scan a Videh contact QR code.");
          scannedRef.current = false;
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await openChatForContact(contact.userId, contact.name, contact.avatarUrl);
      } catch {
        Alert.alert("Error", "Could not open this contact.");
        scannedRef.current = false;
      } finally {
        setResolving(false);
      }
    },
    [openChatForContact, resolving, router, user?.sessionToken],
  );

  const pickQrFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      const hits = await scanFromURLAsync(result.assets[0].uri, ["qr"]);
      const data = hits[0]?.data;
      if (!data) {
        Alert.alert("No QR found", "Could not find a QR code in this image.");
        return;
      }
      scannedRef.current = false;
      await handleScanData(data);
    } catch {
      Alert.alert("Error", "Could not read QR code from this image.");
    }
  };

  const shareMyCode = async () => {
    try {
      await Share.share({
        message: `Add me on Videh: ${qrValue}`,
        title: "My Videh QR",
      });
    } catch {
      /* ignore */
    }
  };

  const ensureCamera = async () => {
    if (permission?.granted) return true;
    const res = await requestPermission();
    return Boolean(res.granted);
  };

  const switchToScan = async () => {
    scannedRef.current = false;
    const ok = await ensureCamera();
    if (!ok) {
      Alert.alert("Camera required", "Allow camera access to scan Videh QR codes.");
      return;
    }
    setTab("scan");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>QR code</Text>
        {tab === "my" ? (
          <TouchableOpacity onPress={() => void shareMyCode()} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={22} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "my" && styles.tabBtnActive]}
          onPress={() => setTab("my")}
        >
          <Text style={[styles.tabText, { color: tab === "my" ? colors.primary : colors.mutedForeground }]}>
            MY CODE
          </Text>
          {tab === "my" ? <View style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "scan" && styles.tabBtnActive]}
          onPress={() => void switchToScan()}
        >
          <Text style={[styles.tabText, { color: tab === "scan" ? colors.primary : colors.mutedForeground }]}>
            SCAN CODE
          </Text>
          {tab === "scan" ? <View style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
        </TouchableOpacity>
      </View>

      {tab === "my" ? (
        <View style={styles.myBody}>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.cardAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.cardAvatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.cardAvatarText}>{initials}</Text>
              </View>
            )}
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>
              {user?.name ?? "Videh user"}
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Videh contact</Text>

            <View style={styles.qrWrap}>
              <VidehQrCode value={qrValue} size={220} />
              <View style={styles.qrLogo}>
                <Text style={styles.qrLogoText}>V</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.privacy, { color: colors.mutedForeground }]}>
            Your QR code is private. If you share it with someone, they can scan it with their Videh camera to add you as a contact.
          </Text>
        </View>
      ) : Platform.OS === "web" ? (
        <View style={styles.scanFallback}>
          <Text style={[styles.privacy, { color: colors.mutedForeground }]}>
            QR scanning works on the Videh mobile app. Open this screen on your phone to scan contacts.
          </Text>
        </View>
      ) : (
        <View style={styles.scanBody}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torchOn}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={resolving ? undefined : (evt) => void handleScanData(evt.data)}
            />
          ) : (
            <View style={styles.scanFallback}>
              <Text style={[styles.privacy, { color: colors.mutedForeground }]}>Camera permission is required.</Text>
              <TouchableOpacity style={[styles.allowBtn, { backgroundColor: colors.primary }]} onPress={() => void ensureCamera()}>
                <Text style={styles.allowBtnText}>Allow camera</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.scanOverlay} pointerEvents="box-none">
            <View style={styles.scanDimTop} />
            <View style={styles.scanMidRow}>
              <View style={styles.scanDimSide} />
              <View style={styles.scanWindow}>
                {resolving ? (
                  <View style={styles.scanBusy}>
                    <ActivityIndicator color="#fff" size="large" />
                  </View>
                ) : null}
              </View>
              <View style={styles.scanDimSide} />
            </View>
            <View style={styles.scanDimBottom}>
              <Text style={styles.scanHint}>Scan a Videh QR code</Text>
              <View style={styles.scanTools}>
                <TouchableOpacity style={styles.toolBtn} onPress={() => void pickQrFromGallery()}>
                  <Ionicons name="image-outline" size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={() => setTorchOn((v) => !v)}>
                  <Ionicons name={torchOn ? "flash" : "flash-outline"} size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 14, position: "relative" },
  tabBtnActive: {},
  tabText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  tabLine: { position: "absolute", bottom: 0, left: 24, right: 24, height: 3, borderRadius: 2 },
  myBody: { flex: 1, alignItems: "center", paddingTop: 28, paddingHorizontal: 24 },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: {},
    }),
  },
  cardAvatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  cardAvatarText: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 72 },
  cardName: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 18 },
  qrWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  qrLogo: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E9EDEF",
  },
  qrLogoText: { color: "#00A884", fontSize: 22, fontFamily: "Inter_800ExtraBold" },
  privacy: {
    marginTop: 24,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 320,
  },
  scanBody: { flex: 1, backgroundColor: "#000" },
  scanFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  scanOverlay: { ...StyleSheet.absoluteFillObject },
  scanDimTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  scanMidRow: { flexDirection: "row", height: 260 },
  scanDimSide: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  scanWindow: {
    width: 260,
    height: 260,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    overflow: "hidden",
  },
  scanBusy: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  scanDimBottom: {
    flex: 1.2,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    paddingTop: 24,
    gap: 20,
  },
  scanHint: { color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium" },
  scanTools: { flexDirection: "row", gap: 48 },
  toolBtn: { padding: 10 },
  allowBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  allowBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
});
