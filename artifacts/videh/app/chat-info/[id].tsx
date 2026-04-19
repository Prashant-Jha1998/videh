import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

export default function ChatInfoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { chats, pinChat, muteChat, archiveChat } = useApp();

  const chat = chats.find((c) => c.id === id);
  const isGroup = chat?.isGroup ?? false;

  const [disappearing, setDisappearing] = useState(false);
  const [muted, setMuted] = useState(chat?.isMuted ?? false);

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = ((name ?? "?").charCodeAt(0) * 37) % 360;
  const avatarBg = `hsl(${hue},50%,40%)`;

  const toggleMute = () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMuted((v) => !v);
    muteChat(id);
  };

  const doBlock = () => {
    Alert.alert(
      `Block ${name ?? "this contact"}`,
      "Blocked contacts will no longer be able to call you or send you messages.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("Blocked", `${name} has been blocked.`);
          },
        },
      ]
    );
  };

  const doReport = () => {
    Alert.alert(
      `Report ${name ?? "this contact"}`,
      "Report and block this contact? The last 5 messages will be shared with Videh.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: () => Alert.alert("Reported", "Your report has been submitted."),
        },
      ]
    );
  };

  const doArchive = () => {
    if (!id) return;
    Alert.alert("Archive chat?", "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive", onPress: () => {
          archiveChat(id);
          router.replace("/(tabs)/chats");
        }
      },
    ]);
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isGroup ? "Group Info" : "Contact Info"}</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar block */}
        <View style={[styles.profileBlock, { backgroundColor: colors.card }]}>
          <View style={[styles.bigAvatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.bigAvatarText}>{initials}</Text>
          </View>
          <Text style={[styles.contactName, { color: colors.foreground }]}>{name ?? chat?.name}</Text>
          {!isGroup && (
            <Text style={[styles.contactPhone, { color: colors.mutedForeground }]}>
              {chat?.isOnline ? "online" : "last seen recently"}
            </Text>
          )}
          {isGroup && (
            <Text style={[styles.contactPhone, { color: colors.mutedForeground }]}>
              {chat?.members?.length ?? 0} members
            </Text>
          )}
          {/* Quick action buttons */}
          <View style={styles.quickActions}>
            {!isGroup && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: colors.primary + "18" }]}
                onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "audio" } })}
              >
                <Ionicons name="call" size={22} color={colors.primary} />
                <Text style={[styles.quickBtnLabel, { color: colors.primary }]}>Audio</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18" }]}
              onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "video" } })}
            >
              <Ionicons name="videocam" size={22} color={colors.primary} />
              <Text style={[styles.quickBtnLabel, { color: colors.primary }]}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18" }]}
              onPress={() => router.back()}
            >
              <Ionicons name="chatbubble" size={22} color={colors.primary} />
              <Text style={[styles.quickBtnLabel, { color: colors.primary }]}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        {!isGroup && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>About</Text>
            <Text style={[styles.sectionValue, { color: colors.foreground }]}>Hey there! I am using Videh.</Text>
          </View>
        )}

        {/* Media, Links, Docs */}
        <TouchableOpacity
          style={[styles.section, { backgroundColor: colors.card }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Media, Links, and Docs</Text>
          <View style={styles.mediaRow}>
            <View style={[styles.mediaPlaceholder, { backgroundColor: colors.muted }]}>
              <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
            </View>
            <View style={[styles.mediaPlaceholder, { backgroundColor: colors.muted }]}>
              <Ionicons name="link-outline" size={28} color={colors.mutedForeground} />
            </View>
            <View style={[styles.mediaPlaceholder, { backgroundColor: colors.muted }]}>
              <Ionicons name="document-outline" size={28} color={colors.mutedForeground} />
            </View>
          </View>
          <Text style={[styles.noMedia, { color: colors.mutedForeground }]}>No media shared yet</Text>
        </TouchableOpacity>

        {/* Settings */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <InfoRow
            icon="notifications-outline"
            iconBg="#FF9800"
            label="Mute notifications"
            colors={colors}
            right={<Switch value={muted} onValueChange={toggleMute} thumbColor={muted ? colors.primary : "#f4f3f4"} trackColor={{ true: colors.primary + "80" }} />}
          />
          <InfoRow
            icon="timer-outline"
            iconBg="#9C27B0"
            label="Disappearing messages"
            value={disappearing ? "1 day" : "Off"}
            colors={colors}
            onPress={() => {
              Alert.alert("Disappearing Messages", "Set a time limit for messages", [
                { text: "Off", onPress: () => setDisappearing(false) },
                { text: "24 hours", onPress: () => setDisappearing(true) },
                { text: "7 days", onPress: () => setDisappearing(true) },
                { text: "Cancel", style: "cancel" },
              ]);
            }}
          />
          <InfoRow
            icon="lock-closed-outline"
            iconBg="#4CAF50"
            label="Encryption"
            value="Messages are end-to-end encrypted"
            colors={colors}
            onPress={() => Alert.alert("End-to-End Encryption", "Messages and calls are secured with end-to-end encryption. Tap to learn more.")}
          />
          <InfoRow
            icon="pin-outline"
            iconBg="#2196F3"
            label="Pin chat"
            colors={colors}
            onPress={() => { pinChat(id!); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Pinned", "Chat has been pinned."); }}
          />
          <InfoRow
            icon="archive-outline"
            iconBg="#607D8B"
            label="Archive chat"
            colors={colors}
            onPress={doArchive}
            last
          />
        </View>

        {/* Group members */}
        {isGroup && chat?.members && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>
              {chat.members.length} participants
            </Text>
            {chat.members.map((m, i) => {
              const mInitials = m.slice(0, 2).toUpperCase();
              const mHue = m.charCodeAt(0) * 37 % 360;
              return (
                <View key={i} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: `hsl(${mHue},50%,45%)` }]}>
                    <Text style={styles.memberInitials}>{mInitials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{m}</Text>
                    <Text style={[styles.memberPhone, { color: colors.mutedForeground }]}>Hey there! I am using Videh.</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Danger zone */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {!isGroup && (
            <TouchableOpacity style={styles.dangerRow} onPress={doBlock} activeOpacity={0.7}>
              <Ionicons name="ban-outline" size={20} color={colors.destructive} />
              <Text style={[styles.dangerText, { color: colors.destructive }]}>Block {name}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.dangerRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]} onPress={doReport} activeOpacity={0.7}>
            <Ionicons name="flag-outline" size={20} color={colors.destructive} />
            <Text style={[styles.dangerText, { color: colors.destructive }]}>Report {name}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon, iconBg, label, value, colors, onPress, right, last
}: {
  icon: string; iconBg: string; label: string; value?: string;
  colors: any; onPress?: () => void; right?: React.ReactNode; last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.infoRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !right}
    >
      <View style={[styles.infoIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.foreground }]}>{label}</Text>
        {value && <Text style={[styles.infoValue, { color: colors.mutedForeground }]} numberOfLines={1}>{value}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null)}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", paddingLeft: 8 },
  headerBtn: { padding: 8 },
  profileBlock: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, marginBottom: 10 },
  bigAvatar: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  bigAvatarText: { color: "#fff", fontSize: 38, fontFamily: "Inter_700Bold" },
  contactName: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  contactPhone: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 20 },
  quickActions: { flexDirection: "row", gap: 16, marginTop: 8 },
  quickBtn: { alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 16, minWidth: 70, gap: 6 },
  quickBtnLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  sectionValue: { fontSize: 15, fontFamily: "Inter_400Regular" },
  mediaRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  mediaPlaceholder: { width: 80, height: 80, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  noMedia: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 14 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  infoValue: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, gap: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  memberInitials: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberPhone: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dangerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  dangerText: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
