import { Image } from "expo-image";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import type { GifMediaItem } from "@/lib/chatGifApi";

type Props = {
  item: GifMediaItem;
  size: number;
  onPress: () => void;
};

/** Grid tile with multi-URL fallback so Giphy/WebP quirks never show blank cells. */
export function GifStickerTile({ item, size, onPress }: Props) {
  const uris = useMemo(() => {
    const list = [item.stillUrl, item.previewUrl, item.gifUrl, item.sendUrl].filter(
      (u): u is string => typeof u === "string" && u.length > 8,
    );
    return [...new Set(list)];
  }, [item]);

  const [uriIndex, setUriIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const uri = uris[uriIndex] ?? uris[0];

  const onError = useCallback(() => {
    setLoaded(false);
    setUriIndex((i) => (i + 1 < uris.length ? i + 1 : i));
  }, [uris.length]);

  const thumbSize = size - 6;

  return (
    <TouchableOpacity
      style={[styles.cell, { width: size, height: size }]}
      activeOpacity={0.72}
      onPress={onPress}
    >
      <View style={[styles.frame, { width: thumbSize, height: thumbSize }]}>
        {!loaded && <View style={styles.skeleton} />}
        {!uri ? null : (
          <Image
            key={uri}
            source={{ uri }}
            style={[styles.img, { width: thumbSize, height: thumbSize }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.id}
            transition={120}
            onLoad={() => setLoaded(true)}
            onError={onError}
          />
        )}
        {uri && !loaded && uriIndex === 0 && (
          <ActivityIndicator size="small" color="#8696A0" style={styles.spinner} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cell: { alignItems: "center", justifyContent: "center" },
  frame: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#E9EDEF",
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E9EDEF",
  },
  img: { borderRadius: 8 },
  spinner: { ...StyleSheet.absoluteFillObject, alignSelf: "center" },
});
