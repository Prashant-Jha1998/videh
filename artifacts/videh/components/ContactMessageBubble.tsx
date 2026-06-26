import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { parseContactMessage } from "@/lib/contactMessage";

type Props = {
  text: string;
  colors: { foreground: string; mutedForeground: string; primary: string; isDark?: boolean };
  isMe: boolean;
  onPress: () => void;
  onCall?: (phone: string) => void;
};

export function ContactMessageBubble({ text, colors, isMe, onPress, onCall }: Props) {
  const contact = parseContactMessage(text);
  if (!contact) return null;

  const primaryPhone = contact.phones[0] ?? "";
  const initials = contact.name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  const titleColor = isMe ? (colors.isDark ? colors.foreground : "#14131F") : colors.foreground;
  const subColor = isMe ? (colors.isDark ? "rgba(255,255,255,0.72)" : "rgba(17,27,33,0.55)") : colors.mutedForeground;

  return (
    <TouchableOpacity style={styles.wrap} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.topRow}>
        <View style={[styles.avatar, { backgroundColor: isMe ? "rgba(255,255,255,0.92)" : "#5B4FE822" }]}>
          <Text style={[styles.avatarTxt, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: titleColor }]} numberOfLines={2}>
            {contact.name}
          </Text>
          {primaryPhone ? (
            <Text style={[styles.phone, { color: subColor }]} numberOfLines={1}>
              {primaryPhone}
            </Text>
          ) : null}
          {contact.phones.length > 1 ? (
            <Text style={[styles.more, { color: subColor }]}>
              +{contact.phones.length - 1} more number{contact.phones.length > 2 ? "s" : ""}
            </Text>
          ) : null}
        </View>
        {primaryPhone && onCall ? (
          <TouchableOpacity
            style={styles.callBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onCall(primaryPhone);
            }}
            hitSlop={10}
          >
            <Ionicons name="call" size={20} color={colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={[styles.divider, { backgroundColor: isMe ? "rgba(0,0,0,0.08)" : colors.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]} />
      <Text style={[styles.action, { color: colors.primary }]}>View contact</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 220, maxWidth: 300, paddingTop: 2, paddingBottom: 0 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 16, fontFamily: "Inter_700Bold" },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  phone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  more: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  callBtn: { padding: 6 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  action: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "center", paddingVertical: 8 },
});
