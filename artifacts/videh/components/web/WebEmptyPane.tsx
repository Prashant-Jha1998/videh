import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { ChatWallpaperPattern } from "@/components/web/ChatWallpaperPattern.web";

type Action = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
};

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  footer?: string;
  actions?: Action[];
};

export function WebEmptyPane({ icon, title, subtitle, footer, actions }: Props) {
  const colors = useColors();
  const bg = colors.isDark ? "#12101F" : "#EDEAF5";

  return (
    <View style={[styles.root, { backgroundColor: bg, borderLeftColor: colors.border }]}>
      <ChatWallpaperPattern />
      <View style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: colors.isDark ? "#202C33" : "#FFFFFF" }]}>
          <Ionicons name={icon} size={48} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.title, { color: colors.isDark ? "#E9EDEF" : "#41525D" }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>{subtitle}</Text>
        {actions && actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.actionTile,
                  { backgroundColor: colors.isDark ? "#202C33" : "#FFFFFF", borderColor: colors.primary, borderWidth: 1, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name={a.icon} size={28} color={colors.primary} />
                <Text style={[styles.actionLabel, { color: colors.primary }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {footer ? (
          <View style={styles.footer}>
            <Ionicons name="lock-closed" size={12} color={colors.mutedForeground} />
            <Text style={[styles.footerTxt, { color: colors.mutedForeground }]}>{footer}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    position: "relative",
    overflow: "hidden",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, zIndex: 1 },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: { fontSize: 32, fontFamily: "Inter_300Light", marginBottom: 12, textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 460, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 36, maxWidth: 520 },
  actionTile: {
    width: 112,
    height: 112,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actionLabel: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 48 },
  footerTxt: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
