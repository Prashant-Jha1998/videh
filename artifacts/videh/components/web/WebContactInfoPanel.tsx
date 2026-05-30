import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ChatMediaGalleryModal } from "@/components/web/ChatMediaGalleryModal";
import { normalizeMessageType } from "@/lib/normalizeMessage";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { WEB_CONTACT_PANEL_WIDTH } from "@/lib/web/webDesktop";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";

type Props = {
  chatId: string;
  chatName: string;
  onClose?: () => void;
};

export function WebContactInfoPanel({ chatId, chatName, onClose }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { chats } = useApp();
  const chat = chats.find((c) => c.id === chatId);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const mediaThumbs = useMemo(() => {
    const msgs = chat?.messages ?? [];
    return msgs
      .filter((m) => {
        const t = normalizeMessageType(m.type, m.text, m.mediaUrl);
        return (t === "image" || t === "video" || t === "document") && m.mediaUrl;
      })
      .slice(-6)
      .reverse();
  }, [chat?.messages]);

  const initials = chatName.slice(0, 2).toUpperCase();
  const hue = chatName.charCodeAt(0) * 37 % 360;

  return (
    <View
      style={[
        styles.panel,
        {
          width: WEB_CONTACT_PANEL_WIDTH,
          backgroundColor: colors.isDark ? "#111B21" : colors.background,
          borderLeftColor: colors.border,
        },
      ]}
    >
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => onClose?.()} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>Contact info</Text>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: chatName } })}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profile}>
          {chat?.avatar ? (
            <Image source={{ uri: chat.avatar }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: `hsl(${hue},50%,42%)` }]}>
              <Text style={styles.avatarTxt}>{initials}</Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.foreground }]}>{chatName}</Text>
        </View>
        <View style={styles.quickRow}>
          {[
            { icon: "call-outline" as const, label: "Voice", onPress: () => router.push({ pathname: "/call/[id]", params: { id: chatId, name: chatName, type: "audio" } }) },
            { icon: "videocam-outline" as const, label: "Video", onPress: () => router.push({ pathname: "/call/[id]", params: { id: chatId, name: chatName, type: "video" } }) },
            { icon: "search-outline" as const, label: "Search", onPress: () => router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: chatName } }) },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={[styles.quickBtn, { backgroundColor: colors.card }]} onPress={a.onPress}>
              <Ionicons name={a.icon} size={22} color={colors.primary} />
              <Text style={[styles.quickLbl, { color: colors.mutedForeground }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.section, { color: colors.mutedForeground }]}>About</Text>
        <Text style={[styles.about, { color: colors.foreground }]}>Hey there! I am using Videh.</Text>
        <TouchableOpacity style={styles.mediaHeader} onPress={() => setGalleryOpen(true)}>
          <Text style={[styles.section, { color: colors.primary, marginBottom: 0 }]}>Media, links and docs</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
        {mediaThumbs.length > 0 ? (
          <TouchableOpacity style={styles.mediaGrid} onPress={() => setGalleryOpen(true)} activeOpacity={0.9}>
            {mediaThumbs.map((m) => {
              const t = normalizeMessageType(m.type, m.text, m.mediaUrl);
              return (
                <View key={m.id} style={[styles.thumb, { backgroundColor: colors.card }]}>
                  {t === "image" && m.mediaUrl ? (
                    <Image source={{ uri: resolvePublicAssetUrl(m.mediaUrl) ?? m.mediaUrl }} style={styles.thumbImg} contentFit="cover" />
                  ) : (
                    <Ionicons
                      name={t === "video" ? "videocam" : "document-text"}
                      size={24}
                      color={colors.mutedForeground}
                    />
                  )}
                </View>
              );
            })}
          </TouchableOpacity>
        ) : (
          <Text style={[styles.about, { color: colors.mutedForeground, marginTop: 0 }]}>No shared media yet</Text>
        )}
        <TouchableOpacity
          style={[styles.menuRow, { borderTopColor: colors.border }]}
          onPress={() => router.push("/starred")}
        >
          <Ionicons name="star-outline" size={20} color={colors.mutedForeground} />
          <Text style={[styles.menuTxt, { color: colors.foreground }]}>Starred messages</Text>
        </TouchableOpacity>
        <View style={styles.encrypt}>
          <Ionicons name="lock-closed" size={12} color={colors.mutedForeground} />
          <Text style={[styles.encryptTxt, { color: colors.mutedForeground }]}>
            Messages and calls are end-to-end encrypted
          </Text>
        </View>
      </ScrollView>
      <ChatMediaGalleryModal
        visible={galleryOpen}
        chatId={chatId}
        chatName={chatName}
        onClose={() => setGalleryOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderLeftWidth: StyleSheet.hairlineWidth, height: "100%" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  scroll: { paddingBottom: 24 },
  profile: { alignItems: "center", paddingVertical: 24 },
  avatar: { width: 200, height: 200, borderRadius: 100, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontSize: 48, fontFamily: "Inter_600SemiBold" },
  name: { fontSize: 22, fontFamily: "Inter_600SemiBold", marginTop: 16, textAlign: "center", paddingHorizontal: 16 },
  quickRow: { flexDirection: "row", justifyContent: "center", gap: 10, paddingHorizontal: 12, marginBottom: 20 },
  quickBtn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 10, gap: 6 },
  quickLbl: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 20, marginBottom: 8 },
  about: { fontSize: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 20, marginBottom: 20 },
  mediaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 6 },
  thumb: { width: 72, height: 72, borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumbImg: { width: "100%", height: "100%" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuTxt: { fontSize: 16, fontFamily: "Inter_400Regular" },
  encrypt: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginTop: 24 },
  encryptTxt: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
});
