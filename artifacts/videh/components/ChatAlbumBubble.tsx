import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  Image as NativeImage,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";

const GAP = 2;

function AlbumTile({
  uri,
  sessionToken,
  style,
  overlay,
  onPress,
}: {
  uri: string;
  sessionToken?: string | null;
  style: StyleProp<ImageStyle>;
  overlay?: string;
  onPress: () => void;
}) {
  const [useNative, setUseNative] = useState(false);
  const [failed, setFailed] = useState(false);
  const absolute = resolvePublicAssetUrl(uri) ?? uri;
  const needsAuth = absolute.includes("/api/chats/media/") && !!sessionToken;
  const isLocal = uri.startsWith("file://") || uri.startsWith("content://");
  const source = needsAuth
    ? { uri: absolute, headers: authFetchHeaders(sessionToken) as Record<string, string> }
    : { uri: absolute };

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[style, styles.tile]}>
      {failed ? (
        <View style={styles.fallback}>
          <Ionicons name="image-outline" size={22} color="rgba(255,255,255,0.85)" />
        </View>
      ) : useNative ? (
        <NativeImage
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy={isLocal ? "none" : "memory-disk"}
          onError={() => setUseNative(true)}
        />
      )}
      {overlay ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{overlay}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function ChatAlbumBubble({
  urls,
  width,
  sessionToken,
  onOpenImage,
}: {
  urls: string[];
  width: number;
  sessionToken?: string | null;
  onOpenImage: (uri: string, index: number) => void;
}) {
  const list = urls.filter(Boolean);
  const count = list.length;
  if (count === 0) return null;

  const h = width;
  const half = (width - GAP) / 2;
  const quarterH = (h - GAP) / 2;

  if (count === 1) {
    return (
      <AlbumTile
        uri={list[0]}
        sessionToken={sessionToken}
        style={{ width, height: h, borderRadius: 12 }}
        onPress={() => onOpenImage(list[0], 0)}
      />
    );
  }

  if (count === 2) {
    return (
      <View style={[styles.row, { width, height: h }]}>
        <AlbumTile
          uri={list[0]}
          sessionToken={sessionToken}
          style={{ width: half, height: h, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}
          onPress={() => onOpenImage(list[0], 0)}
        />
        <AlbumTile
          uri={list[1]}
          sessionToken={sessionToken}
          style={{ width: half, height: h, borderTopRightRadius: 12, borderBottomRightRadius: 12 }}
          onPress={() => onOpenImage(list[1], 1)}
        />
      </View>
    );
  }

  if (count === 3) {
    return (
      <View style={[styles.row, { width, height: h }]}>
        <AlbumTile
          uri={list[0]}
          sessionToken={sessionToken}
          style={{ width: half, height: h, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}
          onPress={() => onOpenImage(list[0], 0)}
        />
        <View style={{ width: half, height: h, gap: GAP }}>
          <AlbumTile
            uri={list[1]}
            sessionToken={sessionToken}
            style={{ width: half, height: quarterH, borderTopRightRadius: 12 }}
            onPress={() => onOpenImage(list[1], 1)}
          />
          <AlbumTile
            uri={list[2]}
            sessionToken={sessionToken}
            style={{ width: half, height: quarterH, borderBottomRightRadius: 12 }}
            onPress={() => onOpenImage(list[2], 2)}
          />
        </View>
      </View>
    );
  }

  const visible = list.slice(0, 4);
  const extra = count - 4;

  return (
    <View style={{ width, height: h, gap: GAP }}>
      <View style={styles.row}>
        <AlbumTile
          uri={visible[0]}
          sessionToken={sessionToken}
          style={{ width: half, height: quarterH, borderTopLeftRadius: 12 }}
          onPress={() => onOpenImage(visible[0], 0)}
        />
        <AlbumTile
          uri={visible[1]}
          sessionToken={sessionToken}
          style={{ width: half, height: quarterH, borderTopRightRadius: 12 }}
          onPress={() => onOpenImage(visible[1], 1)}
        />
      </View>
      <View style={styles.row}>
        <AlbumTile
          uri={visible[2]}
          sessionToken={sessionToken}
          style={{ width: half, height: quarterH, borderBottomLeftRadius: 12 }}
          onPress={() => onOpenImage(visible[2], 2)}
        />
        <AlbumTile
          uri={visible[3]}
          sessionToken={sessionToken}
          style={{ width: half, height: quarterH, borderBottomRightRadius: 12 }}
          overlay={extra > 0 ? `+${extra}` : undefined}
          onPress={() => onOpenImage(visible[3], extra > 0 ? 3 : 3)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: GAP },
  tile: { overflow: "hidden", backgroundColor: "#1a2428" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a2428" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
});
