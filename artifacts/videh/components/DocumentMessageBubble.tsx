import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MediaProgressRing } from "@/components/MediaProgressRing";
import {
  documentCaptionFromText,
  documentFilenameFromText,
  documentPagesFromText,
  getDocumentVisual,
  richDocumentMetaLine,
} from "@/lib/documentMessage";
import type { Message } from "@/context/AppContext";
import { PdfPagePreview } from "@/components/web/PdfPagePreview";
import { extensionFromFilename } from "@/lib/normalizeMessage";
import {
  isColorDark,
  linkColorForBubbleBackground,
  mutedTextColorForBubbleBackground,
  textColorForBubbleBackground,
} from "@/lib/chatBubbleColors";

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
  bubbleBackground?: string;
};

export function DocumentMessageBubble({ item, isMe, colors, onPress, onSaveAs, onCancelUpload, sessionToken, bubbleBackground }: Props) {
  const filename = documentFilenameFromText(item.text);
  const caption = documentCaptionFromText(item.text);
  const pageCount = documentPagesFromText(item.text);
  const visual = getDocumentVisual(filename);
  const uploadPct = item.uploadProgress;
  const downloadPct = item.downloadProgress;
  const uploading = typeof uploadPct === "number" && uploadPct < 100 && !item.uploadFailed;
  const downloading = typeof downloadPct === "number" && downloadPct < 100;
  const transferring = uploading || downloading;
  const transferPercent = uploading ? (uploadPct ?? 0) : downloading ? (downloadPct ?? 0) : 0;
  const failed = item.uploadFailed === true;
  const ready = !!item.localMediaUri && !transferring && !failed;
  const bubbleBg = bubbleBackground ?? (isMe ? "#E0DCFF" : "#FFFFFF");
  const titleColor = textColorForBubbleBackground(bubbleBg, { darkText: colors.foreground });
  const metaColor = mutedTextColorForBubbleBackground(bubbleBg);
  const ringColor = "#5B4FE8";

  let metaLine = richDocumentMetaLine(filename, item.fileSizeBytes, pageCount);
  if (failed) metaLine = "Couldn't send · Tap to retry";
  else if (uploading) metaLine = richDocumentMetaLine(filename, item.fileSizeBytes, pageCount);
  else if (downloading) metaLine = `Downloading… ${transferPercent}%`;
  else if (!isMe && !ready && item.mediaUrl) metaLine = metaLine;

  const isPdf = extensionFromFilename(filename) === "pdf";
  const showPdfPreview = isPdf && !!item.mediaUrl && !failed;

  const actionTint = linkColorForBubbleBackground(bubbleBg);

  const ringTrack = isColorDark(bubbleBg)
    ? "rgba(255,255,255,0.22)"
    : "rgba(0,0,0,0.12)";

  return (
    <Pressable
      style={({ pressed }) => [styles.waRoot, pressed && !uploading && styles.waPressed]}
      onPress={onPress}
      disabled={uploading}
    >
      {showPdfPreview ? (
        <View style={styles.previewTap}>
          <PdfPagePreview
            mediaUrl={item.mediaUrl!}
            filename={filename}
            sessionToken={sessionToken}
            localUri={item.localMediaUri}
            height={200}
          />
          <Pressable
            style={styles.previewOverlay}
            onPress={onPress}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={`Open ${filename}`}
          />
        </View>
      ) : null}

      <View style={styles.waMain}>
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
          uploading && onCancelUpload ? (
            <Pressable onPress={onCancelUpload} hitSlop={8}>
              <MediaProgressRing
                size={42}
                strokeWidth={3}
                progress={transferPercent}
                progressColor={ringColor}
                trackColor={ringTrack}
              >
                <Ionicons name="close" size={18} color={titleColor} />
              </MediaProgressRing>
            </Pressable>
          ) : (
            <View style={styles.actionIcon} pointerEvents="none">
              <MediaProgressRing
                size={42}
                strokeWidth={3}
                progress={transferPercent}
                progressColor={ringColor}
                trackColor={ringTrack}
              >
                <Ionicons name="arrow-down" size={16} color={titleColor} />
              </MediaProgressRing>
            </View>
          )
        ) : (
          <View style={styles.actionIcon}>
            <Ionicons
              name={failed ? "refresh-outline" : ready ? "document-outline" : "arrow-down-circle-outline"}
              size={24}
              color={
                isMe
                  ? isColorDark(bubbleBg)
                    ? "rgba(255,255,255,0.85)"
                    : "rgba(17,27,33,0.45)"
                  : colors.mutedForeground
              }
            />
          </View>
        )}
      </View>

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
            <Pressable
              style={({ pressed }) => [styles.waActionBtn, pressed && styles.waPressed]}
              onPress={(e) => {
                e?.stopPropagation?.();
                onSaveAs();
              }}
            >
              <Text style={[styles.waActionText, { color: actionTint }]}>Save as…</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  waRoot: {
    minWidth: 280,
    maxWidth: 340,
    paddingTop: 4,
    paddingBottom: 4,
  },
  previewTap: {
    position: "relative",
    width: "100%",
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
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
  actionIcon: { width: 40, alignItems: "center", justifyContent: "center" },
  caption: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
});
