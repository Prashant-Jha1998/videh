import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Image,
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

interface SettingRow {
  icon: string;
  iconBg?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, logout } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const initials = (user?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const changeAvatar = async () => {
    Alert.alert("Profile Photo", "Choose how to update your profile photo", [
      {
        text: "Take Photo", onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission needed"); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
          if (!result.canceled && result.assets[0] && user) {
            await setUser({ ...user, avatar: result.assets[0].uri });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }
      },
      {
        text: "Choose from Library", onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission needed"); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
          if (!result.canceled && result.assets[0] && user) {
            await setUser({ ...user, avatar: result.assets[0].uri });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const rows: SettingRow[] = [
    { icon: "card-outline", iconBg: "#4CAF50", label: "Payments", value: "UPI, payment history" },
    { icon: "key-outline", iconBg: "#2196F3", label: "Account", value: "Security notifications, change number" },
    { icon: "lock-closed-outline", iconBg: "#9C27B0", label: "Privacy", value: "Blocked accounts, disappearing messages" },
    { icon: "people-outline", iconBg: "#FF9800", label: "Lists", value: "Manage people and groups" },
    { icon: "chatbubble-outline", iconBg: "#00BCD4", label: "Chats", value: "Theme, wallpapers, chat history" },
    { icon: "radio-outline", iconBg: "#E91E63", label: "Broadcasts", value: "Manage lists and send broadcasts" },
    { icon: "notifications-outline", iconBg: "#FF5722", label: "Notifications", value: "Message, group & call tones" },
    { icon: "server-outline", iconBg: "#607D8B", label: "Storage and data", value: "Network usage, auto-download" },
    { icon: "accessibility-outline", iconBg: "#795548", label: "Accessibility", value: "Increase contrast, animation" },
    { icon: "language-outline", iconBg: "#009688", label: "App language", value: "English (device's language)" },
    { icon: "help-circle-outline", iconBg: "#3F51B5", label: "Help and feedback", value: "Help centre, contact us, privacy policy" },
    { icon: "person-add-outline", iconBg: "#8BC34A", label: "Invite a friend" },
    { icon: "phone-portrait-outline", iconBg: "#00A884", label: "App updates" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Videh</Text>
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
        {/* Profile block — WhatsApp style */}
        <View style={[styles.profileBlock, { backgroundColor: colors.card }]}>
          {/* Avatar with name overlay */}
          <TouchableOpacity style={styles.avatarContainer} onPress={changeAvatar} activeOpacity={0.85}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarInitials}>{initials || "?"}</Text>
              </View>
            )}
            {/* Name overlay at bottom of avatar */}
            <View style={styles.avatarNameOverlay}>
              <Text style={styles.avatarNameText} numberOfLines={1}>
                {user?.name || "Set your name"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Name + edit row */}
          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => router.push("/auth/profile")}
            activeOpacity={0.7}
          >
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {user?.name || "Set your name"}
            </Text>
            <View style={[styles.editBtn, { borderColor: colors.primary }]}>
              <Ionicons name="add" size={18} color={colors.primary} />
            </View>
          </TouchableOpacity>

          {/* About / status */}
          <TouchableOpacity onPress={() => router.push("/auth/profile")} activeOpacity={0.7}>
            <Text style={[styles.profileAbout, { color: colors.mutedForeground }]} numberOfLines={2}>
              {user?.about || "Hey there! I am using Videh."}
            </Text>
          </TouchableOpacity>

          {/* Phone */}
          <Text style={[styles.profilePhone, { color: colors.mutedForeground }]}>
            +91 {user?.phone}
          </Text>
        </View>

        {/* Settings label */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Settings</Text>

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
              <View style={[styles.iconBox, { backgroundColor: item.iconBg ?? colors.primary }]}>
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
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.card }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("Log out", "Are you sure you want to log out?", [
              { text: "Cancel", style: "cancel" },
              { text: "Log Out", style: "destructive", onPress: logout },
            ]);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Log Out</Text>
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
  avatarNameOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.40)",
    paddingVertical: 5,
    alignItems: "center",
  },
  avatarNameText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  editBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
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

  rowsBlock: { marginHorizontal: 0 },
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
    marginHorizontal: 0,
    marginTop: 8,
    paddingVertical: 16,
  },
  logoutText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  version: { textAlign: "center", marginTop: 12, marginBottom: 8, fontSize: 12, fontFamily: "Inter_400Regular" },
});
