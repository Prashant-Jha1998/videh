import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useUiPreferences } from "@/context/UiPreferencesContext";

interface SettingRow {
  icon: string;
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, logout, updateAvatar } = useApp();
  const { t } = useUiPreferences();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const initials = (user?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handlePickedAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset || !user) return;
    if (asset.base64) {
      await updateAvatar(asset.base64, "image/jpeg");
    } else {
      await setUser({ ...user, avatar: asset.uri });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const changeAvatar = () => {
    Alert.alert("Profile Photo", "Choose how to update your profile photo", [
      {
        text: "Take Photo", onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission Denied", "Please allow camera access."); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
          if (!result.canceled && result.assets[0]) handlePickedAsset(result.assets[0]);
        }
      },
      {
        text: "Choose from Library", onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission Denied", "Please allow photo library access."); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
          if (!result.canceled && result.assets[0]) handlePickedAsset(result.assets[0]);
        }
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const doLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t("settings.logout"),
      "Are you sure you want to log out of Videh?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.logout"),
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const inviteFriend = useCallback(async () => {
    const message = "Use Videh - India's fastest messaging app!\n\nFeatures: Broadcasts, group ledger, SOS safety, real-time translation, scheduled messages, and much more.\n\nDownload: https://videh.app";
    try {
      const { Share } = await import("react-native");
      await Share.share({ message, title: "Videh — India's Best Messaging App" });
    } catch {}
  }, []);

  const rows: SettingRow[] = useMemo(
    () => [
      { icon: "key-outline", iconBg: "#2196F3", label: t("settings.row.account"), value: t("settings.row.accountSub"), onPress: () => router.push("/settings/account") },
      { icon: "lock-closed-outline", iconBg: "#9C27B0", label: t("settings.row.privacy"), value: t("settings.row.privacySub"), onPress: () => router.push("/settings/privacy") },
      { icon: "color-palette-outline", iconBg: "#7C3AED", label: "App Theme", value: "20 colors and 30 gradients, free for 1 year", onPress: () => router.push("/settings/theme" as never) },
      { icon: "chatbubble-outline", iconBg: "#00BCD4", label: t("settings.row.chats"), value: t("settings.row.chatsSub"), onPress: () => router.push("/settings/chats") },
      { icon: "radio-outline", iconBg: "#E91E63", label: t("settings.row.broadcasts"), value: t("settings.row.broadcastsSub"), onPress: () => router.push("/broadcasts") },
      { icon: "warning-outline", iconBg: "#E74C3C", label: t("settings.row.sos"), value: t("settings.row.sosSub"), onPress: () => router.push("/settings/sos") },
      { icon: "notifications-outline", iconBg: "#FF5722", label: t("settings.row.notifications"), value: t("settings.row.notificationsSub"), onPress: () => router.push("/settings/notifications") },
      { icon: "server-outline", iconBg: "#607D8B", label: t("settings.row.storage"), value: t("settings.row.storageSub"), onPress: () => router.push("/settings/storage") },
      { icon: "accessibility-outline", iconBg: "#795548", label: t("settings.row.accessibility"), value: t("settings.row.accessibilitySub"), onPress: () => router.push("/settings/accessibility") },
      { icon: "language-outline", iconBg: "#009688", label: t("settings.row.language"), value: t("settings.row.languageSub"), onPress: () => router.push("/settings/language") },
      { icon: "help-circle-outline", iconBg: "#3F51B5", label: t("settings.row.help"), value: t("settings.row.helpSub"), onPress: () => router.push("/settings/help") },
      { icon: "person-add-outline", iconBg: "#8BC34A", label: t("settings.row.invite"), onPress: inviteFriend },
      {
        icon: "phone-portrait-outline",
        iconBg: "#00A884",
        label: t("settings.row.updates"),
        value: t("settings.row.updatesSub"),
        onPress: () =>
          Alert.alert(
            "Videh v1.0.0",
            "You are on the latest version.\n\nHighlights:\n• Broadcast lists\n• Two-step verification\n• Accessibility settings\n• Multi-language support\n• Document, location, and contact sharing",
          ),
      },
    ],
    [t, router, inviteFriend],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>{t("settings.header")}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="grid-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Profile block */}
        <View style={[styles.profileBlock, { backgroundColor: colors.card }]}>
          <TouchableOpacity style={styles.avatarContainer} onPress={changeAvatar} activeOpacity={0.85}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitials}>{initials || "?"}</Text>
              </View>
            )}
            <View style={[styles.cameraOverlay, { backgroundColor: "rgba(0,0,0,0.35)" }]}>
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.nameRow} onPress={() => router.push("/auth/profile")} activeOpacity={0.7}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {user?.name || "Set your name"}
            </Text>
            <View style={[styles.editBtn, { borderColor: colors.primary }]}>
              <Ionicons name="pencil-outline" size={14} color={colors.primary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/auth/profile")} activeOpacity={0.7}>
            <Text style={[styles.profileAbout, { color: colors.mutedForeground }]} numberOfLines={2}>
              {user?.about || "Hey there! I am using Videh."}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.profilePhone, { color: colors.mutedForeground }]}>
            +91 {user?.phone}
          </Text>
        </View>

        {/* Settings label */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t("settings.sectionTitle")}</Text>

        {/* Settings rows */}
        <View style={[styles.rowsBlock, { backgroundColor: colors.card }]}>
          {rows.map((item, idx) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.row,
                idx < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
              ]}
              onPress={item.onPress}
              activeOpacity={0.65}
            >
              <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon as any} size={19} color="#fff" />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                {item.value ? (
                  <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.value}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.card, marginTop: 16 }]}
          onPress={doLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>{t("settings.logout")}</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>Videh v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 6 },
  profileBlock: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 20,
    marginBottom: 4,
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: "hidden",
    marginBottom: 14,
    position: "relative",
  },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { color: "#fff", fontSize: 38, fontFamily: "Inter_700Bold" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  editBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAbout: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 4 },
  profilePhone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rowsBlock: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  logoutText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  version: { textAlign: "center", marginTop: 12, marginBottom: 8, fontSize: 12, fontFamily: "Inter_400Regular" },
});
