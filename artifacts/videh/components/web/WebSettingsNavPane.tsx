import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter, usePathname } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { WEB_LIST_PANE_WIDTH } from "@/lib/web/webDesktop";
import { showHeyVidehComingSoon } from "@/lib/heyVidehFeature";

const ROWS: Array<{ icon: string; iconBg: string; label: string; sub: string; href: string }> = [
  { icon: "mic-circle-outline", iconBg: "#00A884", label: "Hey Videh", sub: "Voice assistant", href: "/settings/assistant" },
  { icon: "key-outline", iconBg: "#2196F3", label: "Account", sub: "Security, account info", href: "/settings/account" },
  { icon: "lock-closed-outline", iconBg: "#9C27B0", label: "Privacy", sub: "Blocked, disappearing", href: "/settings/privacy" },
  { icon: "color-palette-outline", iconBg: "#7C3AED", label: "App theme", sub: "Colors and gradients", href: "/settings/theme" },
  { icon: "chatbubbles-outline", iconBg: "#00BCD4", label: "Chats", sub: "Theme, wallpaper", href: "/settings/chats" },
  { icon: "notifications-outline", iconBg: "#FF5722", label: "Notifications", sub: "Messages and calls", href: "/settings/notifications" },
  { icon: "musical-notes-outline", iconBg: "#7C4DFF", label: "Premium sounds", sub: "Ringtones & tones", href: "/settings/premium-sounds" },
  { icon: "help-circle-outline", iconBg: "#3F51B5", label: "Help", sub: "FAQ and support", href: "/settings/help" },
];

type Props = { width?: number };

export function WebSettingsNavPane({ width = WEB_LIST_PANE_WIDTH }: Props) {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useApp();

  return (
    <View style={[styles.pane, { width, borderRightColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.profileBlock}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.profileImg} />
        ) : (
          <View style={[styles.profileImg, styles.profilePh, { backgroundColor: colors.primary }]}>
            <Text style={styles.profileInitial}>{(user?.name ?? "?").slice(0, 1)}</Text>
          </View>
        )}
        <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
          {user?.name ?? "You"}
        </Text>
      </View>
      <ScrollView>
        {ROWS.map((row) => {
          const active = pathname?.includes(row.href);
          return (
            <TouchableOpacity
              key={row.href}
              style={[
                styles.row,
                { borderBottomColor: colors.border },
                active && { backgroundColor: colors.primary + "12" },
              ]}
              onPress={() => {
                if (row.href === "/settings/assistant") {
                  showHeyVidehComingSoon();
                  return;
                }
                router.push(row.href as never);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.icon, { backgroundColor: row.iconBg }]}>
                <Ionicons name={row.icon as keyof typeof Ionicons.glyphMap} size={18} color="#fff" />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.label, { color: colors.foreground }]}>{row.label}</Text>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>{row.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { borderRightWidth: StyleSheet.hairlineWidth, height: "100%" },
  header: { paddingHorizontal: 16, paddingVertical: 14, paddingTop: 20 },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8, fontFamily: "Inter_400Regular" },
  profileBlock: { alignItems: "center", paddingVertical: 20, gap: 10 },
  profileImg: { width: 72, height: 72, borderRadius: 36 },
  profilePh: { alignItems: "center", justifyContent: "center" },
  profileInitial: { color: "#fff", fontSize: 28, fontFamily: "Inter_600SemiBold" },
  profileName: { fontSize: 18, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1 },
  label: { fontSize: 16, fontFamily: "Inter_500Medium" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
