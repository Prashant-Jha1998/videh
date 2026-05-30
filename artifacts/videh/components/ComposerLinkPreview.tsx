import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { getApiUrl } from "@/lib/api";
import { linkPreviewHostname } from "@/lib/chatUrls";

export type LinkPreviewData = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

type Props = {
  url: string;
  colors: {
    card: string;
    foreground: string;
    mutedForeground: string;
    border: string;
    primary: string;
  };
  onDismiss?: () => void;
};

export function ComposerLinkPreview({ url, colors, onDismiss }: Props) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(
          `${getApiUrl()}/api/link-preview?url=${encodeURIComponent(url)}`,
        );
        const json = (await res.json()) as {
          success?: boolean;
          preview?: LinkPreviewData;
        };
        if (cancelled) return;
        if (json.success && json.preview) {
          setData(json.preview);
        } else {
          setData({ url });
        }
      } catch {
        if (!cancelled) setData({ url });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const host = linkPreviewHostname(url);
  const title = data?.title?.trim() || host;
  const description = data?.description?.trim();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {onDismiss ? (
        <Pressable style={styles.close} onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.host, { color: colors.mutedForeground }]} numberOfLines={1}>
            {host}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          {data?.imageUrl ? (
            <Image source={{ uri: data.imageUrl }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumbPlaceholder, { backgroundColor: colors.border }]}>
              <Ionicons name="link-outline" size={20} color={colors.mutedForeground} />
            </View>
          )}
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {title}
            </Text>
            {description ? (
              <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>
                {description}
              </Text>
            ) : (
              <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={1}>
                {host}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 10,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    overflow: "hidden",
  },
  close: { position: "absolute", top: 6, right: 6, zIndex: 2 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 24 },
  host: { fontSize: 13, flex: 1 },
  body: { flexDirection: "row", gap: 10, paddingRight: 20 },
  thumb: { width: 52, height: 52, borderRadius: 6 },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, justifyContent: "center" },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  desc: { fontSize: 12, marginTop: 2 },
});
