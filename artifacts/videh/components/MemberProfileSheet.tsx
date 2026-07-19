import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatPresenceSubtitle } from "@/lib/presence";

export type MemberProfileData = {
  id: number;
  name: string;
  phone?: string;
  about?: string;
  avatar_url?: string;
  is_online?: boolean;
  last_seen?: string;
  is_admin?: boolean;
};

type Props = {
  visible: boolean;
  member: MemberProfileData | null;
  colors: {
    background: string;
    foreground: string;
    mutedForeground: string;
    border: string;
    card: string;
    primary: string;
    destructive: string;
  };
  isGroupContext?: boolean;
  showAdminActions?: boolean;
  onClose: () => void;
  onMessage: () => void;
  onAudioCall?: () => void;
  onVideoCall?: () => void;
  onViewPhoto?: () => void;
  onMoreOptions?: () => void;
};

export function MemberProfileSheet({
  visible,
  member,
  colors,
  isGroupContext,
  showAdminActions,
  onClose,
  onMessage,
  onAudioCall,
  onVideoCall,
  onViewPhoto,
  onMoreOptions,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!member) return null;

  const initials = (member.name || "?").slice(0, 2).toUpperCase();
  const hue = ((member.name ?? "?").charCodeAt(0) * 37) % 360;
  const presence = formatPresenceSubtitle({
    canSee: true,
    isOnline: Boolean(member.is_online),
    lastSeen: member.last_seen ?? null,
    canSeeLastSeen: member.last_seen != null,
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + 16,
              paddingTop: Platform.OS === "web" ? 12 : 8,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onViewPhoto}
            style={styles.avatarWrap}
          >
            {member.avatar_url ? (
              <Image source={{ uri: member.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: `hsl(${hue},50%,42%)` }]}>
                <Text style={styles.avatarTxt}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={[styles.name, { color: colors.foreground }]}>{member.name}</Text>
          {member.is_admin && isGroupContext ? (
            <Text style={[styles.adminBadge, { color: colors.primary }]}>Group admin</Text>
          ) : null}
          <Text style={[styles.presence, { color: colors.mutedForeground }]}>{presence}</Text>

          {member.phone ? (
            <Text style={[styles.phone, { color: colors.mutedForeground }]}>{member.phone}</Text>
          ) : null}

          <View style={[styles.aboutBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.aboutLabel, { color: colors.primary }]}>About</Text>
            <Text style={[styles.aboutText, { color: colors.foreground }]}>
              {member.about?.trim() || "Hey there! I am using Videh."}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={onMessage}>
              <Ionicons name="chatbubble" size={22} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.primary }]}>Message</Text>
            </TouchableOpacity>
            {onAudioCall ? (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={onAudioCall}>
                <Ionicons name="call" size={22} color={colors.primary} />
                <Text style={[styles.actionLabel, { color: colors.primary }]}>Audio</Text>
              </TouchableOpacity>
            ) : null}
            {onVideoCall ? (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]} onPress={onVideoCall}>
                <Ionicons name="videocam" size={22} color={colors.primary} />
                <Text style={[styles.actionLabel, { color: colors.primary }]}>Video</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {showAdminActions && onMoreOptions ? (
            <TouchableOpacity style={[styles.moreRow, { borderTopColor: colors.border }]} onPress={onMoreOptions}>
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
              <Text style={[styles.moreText, { color: colors.foreground }]}>Group admin options</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, alignItems: "center" },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  closeBtn: { position: "absolute", right: 16, top: 16, zIndex: 2 },
  avatarWrap: { marginTop: 8, marginBottom: 12 },
  avatar: { width: 112, height: 112, borderRadius: 56 },
  avatarTxt: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 112 },
  name: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  adminBadge: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  presence: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  phone: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 6 },
  aboutBox: { width: "100%", borderRadius: 10, padding: 14, marginTop: 16 },
  aboutLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  aboutText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  actions: { flexDirection: "row", gap: 12, marginTop: 20, width: "100%", justifyContent: "center" },
  actionBtn: { alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, minWidth: 88 },
  actionLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 6 },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 14,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  moreText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
