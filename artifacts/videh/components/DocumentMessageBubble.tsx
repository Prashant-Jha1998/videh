import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MediaProgressRing } from "@/components/MediaProgressRing";
import {
  documentMetaLine,
  getDocumentVisual,
  whatsappDocumentMetaLine,
} from "@/lib/documentMessage";
import type { Message } from "@/context/AppContext";
import { PdfPagePreview } from "@/components/web/PdfPagePreview";
import { extensionFromFilename } from "@/lib/normalizeMessage";

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
  onSaveAs?: () => void;
  sessionToken?: string | null;
};

export function DocumentMessageBubble({ item, isMe, colors, onPress, onSaveAs, sessionToken }: Props) {
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
  const ringColor = "#00A884";
  const useWaWeb = Platform.OS === "web";

  let metaLine = useWaWeb
    ? whatsappDocumentMetaLine(item.text, item.fileSizeBytes)
    : documentMetaLine(item.fileSizeBytes);
  if (failed) metaLine = "Couldn't send · Tap to retry";
  else if (uploading) metaLine = `Uploading… ${transferPercent}%`;
  else if (downloading) metaLine = `Downloading… ${transferPercent}%`;
  else if (!isMe && !ready && item.mediaUrl && !useWaWeb) metaLine = "Tap to download";

  const actionTint = isMe
    ? colors.isDark
      ? "#53BDEB"
      : "#027EB5"
    : colors.isDark
      ? "#53BDEB"
      : "#027EB5";

  const showPdfPreview =
    useWaWeb
    && !!item.mediaUrl
    && extensionFromFilename(item.text || "") === "pdf"
    && !uploading
    && !failed;

  if (useWaWeb) {
    return (
      <View style={styles.waRoot}>
        {showPdfPreview ? (
          <PdfPagePreview
            mediaUrl={item.mediaUrl!}
            filename={item.text || "document.pdf"}
            sessionToken={sessionToken}
            height={200}
          />
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.waMain, pressed && styles.waPressed]}
          onPress={onPress}
          disabled={uploading}
        >
          <View style={[styles.waIconBox, { backgroundColor: isMe ? "rgba(255,255,255,0.95)" : visual.iconBg }]}>
            <Ionicons name={visual.icon} size={28} color={visual.iconColor} />
          </View>
          <View style={styles.waBody}>
            <Text style={[styles.waName, { color: titleColor }]} numberOfLines={2}>
              {item.text || "Document"}
            </Text>
            <Text style={[styles.waMeta, { color: failed ? "#c62828" : metaColor }]} numberOfLines={1}>
              {metaLine}
            </Text>
          </View>
          {transferring ? (
            <MediaProgressRing
              size={36}
              strokeWidth={3}
              progress={transferPercent}
              progressColor={ringColor}
              trackColor="rgba(0,0,0,0.08)"
            >
              <Text style={[styles.ringPct, { color: titleColor }]}>{transferPercent}</Text>
            </MediaProgressRing>
          ) : null}
        </Pressable>
        {!transferring && !failed ? (
          <>
            <View style={[styles.waDivider, { backgroundColor: isMe ? "rgba(0,0,0,0.08)" : colors.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]} />
            <View style={styles.waActions}>
              <Pressable
                style={({ pressed }) => [styles.waActionBtn, pressed && styles.waPressed]}
                onPress={onPress}
              >
                <Text style={[styles.waActionText, { color: actionTint }]}>Open</Text>
              </Pressable>
              {onSaveAs ? (
                <Pressable
                  style={({ pressed }) => [styles.waActionBtn, pressed && styles.waPressed]}
                  onPress={onSaveAs}
                >
                  <Text style={[styles.waActionText, { color: actionTint }]}>Save as…</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    );
  }

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
  waRoot: {
    minWidth: 280,
    maxWidth: 360,
    paddingTop: 4,
    paddingBottom: 2,
  },
  waMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  waIconBox: {
    width: 52,
    height: 52,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  waBody: { flex: 1, minWidth: 0 },
  waName: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19, marginBottom: 4 },
  waMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  waDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 10 },
  waActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  waActionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 2,
  },
  waActionText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  waPressed: { opacity: 0.72 },
});
