import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MediaProgressRing } from "@/components/MediaProgressRing";
import {
  documentCaptionFromText,
  documentFilenameFromText,
  documentPagesFromText,
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
  onCancelUpload?: () => void;
  sessionToken?: string | null;
};

export function DocumentMessageBubble({ item, isMe, colors, onPress, onSaveAs, onCancelUpload, sessionToken }: Props) {
  const filename = documentFilenameFromText(item.text);
  const caption = documentCaptionFromText(item.text);
  const pageCount = documentPagesFromText(item.text);
  const visual = getDocumentVisual(filename);
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

  let metaLine = whatsappDocumentMetaLine(filename, item.fileSizeBytes, pageCount);
  if (failed) metaLine = "Couldn't send · Tap to retry";
  else if (uploading) metaLine = whatsappDocumentMetaLine(filename, item.fileSizeBytes, pageCount);
  else if (downloading) metaLine = `Downloading… ${transferPercent}%`;
  else if (!isMe && !ready && item.mediaUrl) metaLine = metaLine;

  const isPdf = extensionFromFilename(filename) === "pdf";
  const showPdfPreview = isPdf && !!item.mediaUrl && !failed;

  const actionTint = isMe
    ? colors.isDark ? "#53BDEB" : "#027EB5"
    : colors.isDark ? "#53BDEB" : "#027EB5";

  return (
    <View style={styles.waRoot}>
      {showPdfPreview ? (
        <PdfPagePreview
          mediaUrl={item.mediaUrl!}
          filename={filename}
          sessionToken={sessionToken}
          localUri={item.localMediaUri}
          height={200}
        />
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.waMain, pressed && styles.waPressed]}
        onPress={onPress}
        disabled={uploading}
      >
        {!showPdfPreview ? (
          <View style={[styles.waIconBox, { backgroundColor: isMe ? "rgba(255,255,255,0.95)" : visual.iconBg }]}>
            <Ionicons name={visual.icon} size={28} color={visual.iconColor} />
          </View>
        ) : null}

        <View style={styles.waBody}>
          <Text style={[styles.waName, { color: titleColor }]} numberOfLines={2}>
            {filename}
          </Text>
          <Text style={[styles.waMeta, { color: failed ? "#c62828" : metaColor }]} numberOfLines={2}>
            {metaLine}
          </Text>
        </View>

        {transferring ? (
          <Pressable
            onPress={uploading && onCancelUpload ? onCancelUpload : undefined}
            hitSlop={8}
            disabled={!uploading || !onCancelUpload}
          >
            <MediaProgressRing
              size={40}
              strokeWidth={3}
              progress={transferPercent}
              progressColor={ringColor}
              trackColor="rgba(0,0,0,0.08)"
            >
              {uploading ? (
                <Ionicons name="close" size={18} color={titleColor} />
              ) : (
                <Text style={[styles.ringPct, { color: titleColor }]}>{transferPercent}</Text>
              )}
            </MediaProgressRing>
          </Pressable>
        ) : (
          <View style={styles.actionIcon}>
            <Ionicons
              name={failed ? "refresh-outline" : ready ? "document-outline" : "arrow-down-circle-outline"}
              size={24}
              color={isMe ? (colors.isDark ? "rgba(255,255,255,0.85)" : "rgba(17,27,33,0.45)") : colors.mutedForeground}
            />
          </View>
        )}
      </Pressable>

      {caption ? (
        <Text style={[styles.caption, { color: titleColor }]}>{caption}</Text>
      ) : null}

      {!transferring && !failed && Platform.OS === "web" && onSaveAs ? (
        <>
          <View style={[styles.waDivider, { backgroundColor: isMe ? "rgba(0,0,0,0.08)" : colors.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }]} />
          <View style={styles.waActions}>
            <Pressable style={({ pressed }) => [styles.waActionBtn, pressed && styles.waPressed]} onPress={onPress}>
              <Text style={[styles.waActionText, { color: actionTint }]}>Open</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.waActionBtn, pressed && styles.waPressed]} onPress={onSaveAs}>
              <Text style={[styles.waActionText, { color: actionTint }]}>Save as…</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  waRoot: {
    minWidth: 280,
    maxWidth: 340,
    paddingTop: 4,
    paddingBottom: 4,
  },
  waMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  waActionBtn: { flex: 1, alignItems: "center", paddingVertical: 2 },
  waActionText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  waPressed: { opacity: 0.72 },
  ringPct: { fontSize: 10, fontFamily: "Inter_700Bold" },
  actionIcon: { width: 40, alignItems: "center", justifyContent: "center" },
  caption: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
});
