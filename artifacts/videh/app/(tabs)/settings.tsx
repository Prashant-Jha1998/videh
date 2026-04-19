import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

interface SettingItem {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const initials = (user?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const sections: { title?: string; items: SettingItem[] }[] = [
    {
      items: [
        { icon: "key-outline", label: "Account", value: "Privacy, security, change number" },
        { icon: "lock-closed-outline", label: "Privacy", value: "Block contacts, disappearing messages" },
        { icon: "notifications-outline", label: "Notifications", value: "Message, group & call tones" },
        { icon: "chatbubble-outline", label: "Chats", value: "Theme, wallpapers, chat history" },
      ],
    },
    {
      items: [
        { icon: "cellular-outline", label: "Storage and Data", value: "Network usage, auto-download" },
        { icon: "language-outline", label: "App Language", value: "English" },
        { icon: "help-circle-outline", label: "Help", value: "Help centre, contact us, privacy policy" },
      ],
    },
    {
      items: [
        { icon: "person-add-outline", label: "Invite a Friend" },
        {
          icon: "log-out-outline",
          label: "Log Out",
          danger: true,
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("Log out", "Are you sure you want to log out?", [
              { text: "Cancel", style: "cancel" },
              { text: "Log Out", style: "destructive", onPress: logout },
            ]);
          },
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="search-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Profile card */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push("/auth/profile")}
        >
          <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.profileAvatarText}>{initials || "?"}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name || "Set your name"}</Text>
            <Text style={[styles.profileAbout, { color: colors.mutedForeground }]} numberOfLines={1}>
              {user?.about || "Hey there! I am using Videh."}
            </Text>
            <Text style={[styles.profilePhone, { color: colors.mutedForeground }]}>+91 {user?.phone}</Text>
          </View>
          <Ionicons name="qr-code-outline" size={24} color={colors.mutedForeground} />
        </TouchableOpacity>

        {sections.map((section, si) => (
          <View key={si} style={[styles.section, { backgroundColor: colors.card, borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            {section.items.map((item, ii) => (
              <TouchableOpacity
                key={ii}
                style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: ii < section.items.length - 1 ? 0.5 : 0 }]}
                onPress={item.onPress}
                activeOpacity={item.onPress ? 0.7 : 1}
              >
                <View style={[styles.iconBox, { backgroundColor: item.danger ? "#fee2e2" : colors.accent }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.danger ? colors.destructive : colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>{item.label}</Text>
                  {item.value && <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>{item.value}</Text>}
                </View>
                {!item.danger && <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />}
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <Text style={[styles.version, { color: colors.mutedForeground }]}>Videh v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerBtn: { padding: 6 },
  profileCard: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 0.5, gap: 14, marginBottom: 8 },
  profileAvatar: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  profileAbout: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  profilePhone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { borderTopWidth: 0.5, borderBottomWidth: 0.5, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  version: { textAlign: "center", marginTop: 12, fontSize: 12, fontFamily: "Inter_400Regular" },
});
