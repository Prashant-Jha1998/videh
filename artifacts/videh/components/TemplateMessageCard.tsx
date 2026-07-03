import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { BusinessTemplateButton, BusinessTemplatePayload } from "@/lib/businessTemplateMessage";
import {
  normalizeExternalUrl,
  normalizePhoneDialUri,
  shouldShowReadMore,
  truncateTemplateBody,
} from "@/lib/businessTemplateMessage";

type Props = {
  payload: BusinessTemplatePayload;
  isDark?: boolean;
  sessionToken?: string;
  maxWidth?: number;
  onOpenImage?: (uri: string) => void;
  onOpenVideo?: (uri: string) => void;
  onOpenDocument?: (uri: string, name?: string) => void;
  onQuickReply?: (text: string) => void;
};

function ButtonIcon({ type }: { type: BusinessTemplateButton["type"] }) {
  if (type === "URL") return <Ionicons name="open-outline" size={16} color="#059669" />;
  if (type === "PHONE_NUMBER") return <Ionicons name="call-outline" size={16} color="#059669" />;
  return null;
}

function HeaderMedia({
  format,
  mediaUrl,
  documentName,
  sessionToken,
  onOpenImage,
  onOpenVideo,
  onOpenDocument,
}: {
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  mediaUrl?: string;
  documentName?: string;
  sessionToken?: string;
  onOpenImage?: (uri: string) => void;
  onOpenVideo?: (uri: string) => void;
  onOpenDocument?: (uri: string, name?: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const uri = mediaUrl?.trim();

  if (!uri) {
    return (
      <View style={styles.mediaPlaceholder}>
        <Ionicons
          name={format === "VIDEO" ? "play-circle-outline" : format === "DOCUMENT" ? "document-outline" : "image-outline"}
          size={36}
          color="#8696A0"
        />
      </View>
    );
  }

  if (format === "DOCUMENT") {
    return (
      <TouchableOpacity
        style={styles.documentHeader}
        activeOpacity={0.85}
        onPress={() => {
          if (onOpenDocument) onOpenDocument(uri, documentName);
          else Linking.openURL(uri).catch(() => {});
        }}
      >
        <View style={styles.documentIconWrap}>
          <Ionicons name="document-text-outline" size={28} color="#059669" />
        </View>
        <Text style={styles.documentName} numberOfLines={2}>
          {documentName?.trim() || "Document"}
        </Text>
        <Ionicons name="download-outline" size={20} color="#667781" />
      </TouchableOpacity>
    );
  }

  const open = () => {
    if (format === "VIDEO") {
      if (onOpenVideo) onOpenVideo(uri);
      else Linking.openURL(uri).catch(() => {});
      return;
    }
    if (onOpenImage) onOpenImage(uri);
  };

  return (
    <Pressable style={styles.mediaFrame} onPress={open}>
      {!error ? (
        <Image
          source={{
            uri,
            ...(sessionToken ? { headers: { Authorization: `Bearer ${sessionToken}` } } : {}),
          }}
          style={styles.mediaImage}
          contentFit="cover"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      ) : null}
      {(loading || error) && (
        <View style={styles.mediaOverlay}>
          {loading && !error ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="image-outline" size={32} color="#8696A0" />
          )}
        </View>
      )}
      {format === "VIDEO" && !error ? (
        <View style={styles.playBadge}>
          <Ionicons name="play" size={22} color="#fff" />
        </View>
      ) : null}
    </Pressable>
  );
}

export function TemplateMessageCard({
  payload,
  isDark,
  sessionToken,
  maxWidth = 300,
  onOpenImage,
  onOpenVideo,
  onOpenDocument,
  onQuickReply,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const body = payload.body.trim();
  const showReadMore = shouldShowReadMore(body);
  const bodyDisplay = expanded || !showReadMore ? body : truncateTemplateBody(body);
  const cardBg = isDark ? "#1F2C34" : "#FFFFFF";
  const bodyColor = isDark ? "#E9EDEF" : "#111B21";
  const mutedColor = isDark ? "#8696A0" : "#667781";
  const header = payload.header;
  const hasButtons = payload.buttons.length > 0;

  const handleButtonPress = (btn: BusinessTemplateButton) => {
    if (btn.type === "URL" && btn.url) {
      Linking.openURL(normalizeExternalUrl(btn.url)).catch(() => {});
      return;
    }
    if (btn.type === "PHONE_NUMBER" && btn.phone_number) {
      Linking.openURL(normalizePhoneDialUri(btn.phone_number)).catch(() => {});
      return;
    }
    if (btn.type === "QUICK_REPLY" && btn.text.trim()) {
      onQuickReply?.(btn.text.trim());
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: cardBg, maxWidth }, isDark ? styles.cardDark : styles.cardLight]}>
      {header?.format === "TEXT" && header.text ? (
        <Text style={[styles.headerText, { color: bodyColor }]}>{header.text}</Text>
      ) : null}

      {header && (header.format === "IMAGE" || header.format === "VIDEO" || header.format === "DOCUMENT") ? (
        <HeaderMedia
          format={header.format}
          mediaUrl={header.mediaUrl}
          documentName={header.documentName}
          sessionToken={sessionToken}
          onOpenImage={onOpenImage}
          onOpenVideo={onOpenVideo}
          onOpenDocument={onOpenDocument}
        />
      ) : null}

      {body ? (
        <View style={[styles.bodyWrap, !header && styles.bodyWrapTop]}>
          <Text style={[styles.bodyText, { color: bodyColor }]}>{bodyDisplay}</Text>
          {showReadMore ? (
            <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8}>
              <Text style={styles.readMore}>{expanded ? "Read less" : "Read more"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {payload.footer ? (
        <Text style={[styles.footer, { color: mutedColor }]}>{payload.footer}</Text>
      ) : null}

      {hasButtons ? (
        <View style={styles.buttonsWrap}>
          {payload.buttons.map((btn, i) => (
            <TouchableOpacity
              key={`${btn.type}-${i}-${btn.text}`}
              style={[styles.buttonRow, i === 0 && styles.buttonRowFirst]}
              onPress={() => handleButtonPress(btn)}
              activeOpacity={0.75}
            >
              <ButtonIcon type={btn.type} />
              <Text style={styles.buttonText} numberOfLines={1}>
                {btn.text.trim() || "Button"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    overflow: "hidden",
    minWidth: 220,
  },
  cardLight: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    android: { elevation: 1 },
    default: {},
  }),
  cardDark: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 21,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  mediaFrame: {
    width: "100%",
    aspectRatio: 800 / 418,
    maxHeight: 180,
    backgroundColor: "#2A2838",
    position: "relative",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(42,40,56,0.55)",
  },
  mediaPlaceholder: {
    width: "100%",
    aspectRatio: 800 / 418,
    maxHeight: 160,
    backgroundColor: "#ECE5DD",
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  documentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "rgba(91,79,232,0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  documentIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(91,79,232,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  documentName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#111B21",
  },
  bodyWrap: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  bodyWrapTop: {
    paddingTop: 10,
  },
  bodyText: {
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  readMore: {
    marginTop: 4,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
  },
  footer: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 10,
    paddingBottom: 8,
    lineHeight: 16,
  },
  buttonsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: "rgba(91,79,232,0.04)",
  },
  buttonRowFirst: {
    borderTopWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#059669",
    maxWidth: "85%",
  },
});
