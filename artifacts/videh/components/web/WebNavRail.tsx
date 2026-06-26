import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import type { WebDesktopSection } from "@/lib/web/webDesktop";
import { WEB_NAV_RAIL_WIDTH } from "@/lib/web/webDesktop";

type NavItem = {
  id: WebDesktopSection | "communities" | "channels";
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  route?: string;
  onPress?: () => void;
  badge?: number;
};

const ITEMS: NavItem[] = [
  { id: "chats", icon: "chatbubbles-outline", iconActive: "chatbubbles", route: "/(tabs)/chats" },
  { id: "calls", icon: "call-outline", iconActive: "call", route: "/(tabs)/calls" },
  { id: "status", icon: "ellipse-outline", iconActive: "radio-button-on", route: "/(tabs)/status" },
  {
    id: "communities",
    icon: "people-outline",
    iconActive: "people",
    route: "/broadcasts",
  },
  {
    id: "channels",
    icon: "megaphone-outline",
    iconActive: "megaphone",
    route: "/(tabs)/video",
  },
  { id: "starred", icon: "star-outline", iconActive: "star", route: "/starred" },
  { id: "archived", icon: "archive-outline", iconActive: "archive", route: "/(tabs)/chats?archived=1" },
  { id: "settings", icon: "settings-outline", iconActive: "settings", route: "/(tabs)/settings" },
];

type Props = {
  active: WebDesktopSection;
};

export function WebNavRail({ active }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { chats, user } = useApp();
  const unread = chats.filter((c) => !c.isArchived).reduce((n, c) => n + c.unreadCount, 0);
  const railBg = colors.isDark ? "#14131F" : "#F0F2F5";

  return (
    <View style={[styles.rail, { width: WEB_NAV_RAIL_WIDTH, backgroundColor: railBg, borderRightColor: colors.border }]}>
      <View style={styles.icons}>
        {ITEMS.map((item) => {
          const selected = active === item.id;
          const badge = item.id === "chats" ? unread : 0;
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.iconBtn}
              onPress={() => {
                if (item.onPress) item.onPress();
                else if (item.route) router.push(item.route as never);
              }}
              activeOpacity={0.75}
            >
              {selected ? <View style={[styles.indicator, { backgroundColor: colors.primary }]} /> : null}
              <Ionicons
                name={selected ? item.iconActive : item.icon}
                size={24}
                color={selected ? colors.primary : colors.mutedForeground}
              />
              {badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeTxt}>{badge > 99 ? "99+" : badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() => router.push("/(tabs)/settings")}
        activeOpacity={0.8}
      >
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.profileImg} />
        ) : (
          <View style={[styles.profilePh, { backgroundColor: colors.primary }]}>
            <Text style={styles.profileInitial}>{(user?.name ?? "?").slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRightWidth: StyleSheet.hairlineWidth,
    height: "100%",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 12,
  },
  icons: { alignItems: "center", gap: 4 },
  iconBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  indicator: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeTxt: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  profileBtn: { alignItems: "center", paddingBottom: 8 },
  profileImg: { width: 40, height: 40, borderRadius: 20 },
  profilePh: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  profileInitial: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
