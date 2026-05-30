import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MediaProgressRing } from "@/components/MediaProgressRing";
import { documentMetaLine, getDocumentVisual } from "@/lib/documentMessage";
import type { Message } from "@/context/AppContext";

type Colors = {
  foreground: string;
  mutedForeground: string;
  isDark?: boolean;
};

type Props = {
  item: Message;
  isMe: boolean;
  colors: Colors;
  onPress: () => void;
};

export function DocumentMessageBubble({ item, isMe, colors, onPress }: Props) {
  const visual = getDocumentVisual(item.text);
  const uploading = typeof item.uploadProgress === "number" && item.uploadProgress < 100;
  const downloading = typeof item.downloadProgress === "number" && item.downloadProgress < 100;
  const transferring = uploading || downloading;
  const transferPercent = uploading
    ? (item.uploadProgress ?? 0)
    : downloading
      ? (item.downloadProgress ?? 0)
      : 0;
  const failed = item.uploadFailed === true;
  const ready = !!item.localMediaUri && !transferring && !failed;
  const titleColor = isMe ? (colors.isDark ? colors.foreground : "#111B21") : colors.foreground;
  const metaColor = isMe ? (colors.isDark ? "rgba(255,255,255,0.72)" : "rgba(17,27,33,0.55)") : colors.mutedForeground;
  const ringColor = isMe ? "#00A884" : "#00A884";

  let metaLine = documentMetaLine(item.fileSizeBytes);
  if (failed) metaLine = "Couldn't send · Tap to retry";
  else if (uploading) metaLine = `Uploading… ${transferPercent}%`;
  else if (downloading) metaLine = `Downloading… ${transferPercent}%`;
  else if (!isMe && !ready && item.mediaUrl) metaLine = "Tap to download";

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
      disabled={uploading}
    >
      <View
        style={[
          styles.iconBox,
          {
            backgroundColor: isMe ? "rgba(255,255,255,0.92)" : visual.iconBg,
          },
        ]}
      >
        <Ionicons name={visual.icon} size={26} color={visual.iconColor} />
        <Text style={[styles.badge, { color: visual.iconColor }]} numberOfLines={1}>
          {visual.badge}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: titleColor }]} numberOfLines={2}>
          {item.text || "Document"}
        </Text>
        <Text style={[styles.meta, { color: failed ? "#c62828" : metaColor }]} numberOfLines={2}>
          {metaLine}
        </Text>
      </View>

      <View style={styles.action}>
        {transferring ? (
          <MediaProgressRing
            size={40}
            strokeWidth={3}
            progress={transferPercent}
            progressColor={ringColor}
            trackColor={isMe ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.08)"}
          >
            <Text style={[styles.ringPct, { color: isMe ? "#111B21" : colors.foreground }]}>
              {transferPercent}
            </Text>
          </MediaProgressRing>
        ) : (
          <Ionicons
            name={failed ? "refresh-outline" : ready ? "document-outline" : "arrow-down-circle-outline"}
            size={22}
            color={isMe ? (colors.isDark ? "rgba(255,255,255,0.85)" : "rgba(17,27,33,0.45)") : colors.mutedForeground}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 248,
    maxWidth: 300,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    bottom: 2,
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  action: { width: 40, alignItems: "center", justifyContent: "center" },
  ringPct: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
