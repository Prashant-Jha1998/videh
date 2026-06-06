import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";
import type { useColors } from "@/hooks/useColors";
import {
  loadGalleryAlbums,
  loadGalleryAssetsPage,
  type GalleryAlbum,
  type GalleryAsset,
} from "@/lib/galleryPicker";

const SCREEN_H = Dimensions.get("window").height;
const SCREEN_W = Dimensions.get("window").width;
const GALLERY_COLS = 4;
const GALLERY_GAP = 2;
const CELL = Math.floor((SCREEN_W - 16 - GALLERY_GAP * (GALLERY_COLS - 1)) / GALLERY_COLS);
const PEEK_ROWS = 2.5;
const COLLAPSED_GALLERY_H = Math.ceil(CELL * PEEK_ROWS + GALLERY_GAP * 2);
const COLLAPSED_BODY_H = 300;
const EXPANDED_RATIO = 0.9;

export type AttachSheetAction =
  | "document"
  | "camera"
  | "videocamera"
  | "gallery"
  | "audiofile"
  | "location"
  | "contact"
  | "viewonce";

const ATTACH_ITEMS: {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  type: AttachSheetAction;
}[] = [
  { key: "gal", icon: "images", label: "Gallery", color: "#2F80ED", type: "gallery" },
  { key: "cam", icon: "camera", label: "Camera", color: "#E8558D", type: "camera" },
  { key: "loc", icon: "location", label: "Location", color: "#25D366", type: "location" },
  { key: "con", icon: "person", label: "Contact", color: "#1296D4", type: "contact" },
  { key: "doc", icon: "document-text", label: "Document", color: "#8B5CF6", type: "document" },
  { key: "vidcam", icon: "videocam", label: "Record video", color: "#C2185B", type: "videocamera" },
  { key: "aud", icon: "musical-notes", label: "Audio", color: "#F2A742", type: "audiofile" },
];

function formatVideoDur(ms?: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  visible: boolean;
  colors: ReturnType<typeof useColors>;
  insets: EdgeInsets;
  onClose: () => void;
  onAction: (type: AttachSheetAction) => void;
  onPickAsset: (asset: GalleryAsset) => void;
};

export function ChatAttachSheet({ visible, colors, insets, onClose, onAction, onPickAsset }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const sheetHeight = useRef(new Animated.Value(COLLAPSED_BODY_H + COLLAPSED_GALLERY_H + insets.bottom)).current;
  const expandedRef = useRef(false);
  expandedRef.current = expanded;

  const collapsedH = COLLAPSED_BODY_H + COLLAPSED_GALLERY_H + insets.bottom + 12;
  const expandedH = SCREEN_H * EXPANDED_RATIO;

  const snapExpand = useCallback(() => {
    setExpanded(true);
    Animated.spring(sheetHeight, {
      toValue: expandedH,
      useNativeDriver: false,
      friction: 9,
      tension: 65,
    }).start();
  }, [expandedH, sheetHeight]);

  const snapCollapse = useCallback(() => {
    setExpanded(false);
    Animated.spring(sheetHeight, {
      toValue: collapsedH,
      useNativeDriver: false,
      friction: 9,
      tension: 65,
    }).start();
  }, [collapsedH, sheetHeight]);

  const dragStartH = useRef(collapsedH);

  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((v) => {
          dragStartH.current = typeof v === "number" ? v : collapsedH;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(collapsedH * 0.85, Math.min(expandedH, dragStartH.current - g.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 48 && expandedRef.current) {
          snapCollapse();
          return;
        }
        if (g.dy < -28 || g.vy < -0.35) {
          snapExpand();
          return;
        }
        if (g.dy > 28 && !expandedRef.current) {
          snapCollapse();
          return;
        }
        if (expandedRef.current) snapExpand();
        else snapCollapse();
      },
    }),
  ).current;

  const resetSheet = useCallback(() => {
    setExpanded(false);
    setAlbumMenuOpen(false);
    setAssets([]);
    setAlbums([]);
    setSelectedAlbum(null);
    setEndCursor(undefined);
    setHasNextPage(false);
    sheetHeight.setValue(collapsedH);
  }, [collapsedH, sheetHeight]);

  useEffect(() => {
    if (!visible) {
      resetSheet();
      return;
    }
    if (Platform.OS === "web") return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const list = await loadGalleryAlbums();
      if (cancelled) return;
      setAlbums(list);
      const recents = list[0] ?? { id: "", title: "Recents", assetCount: 0 };
      setSelectedAlbum(recents);
      const page = await loadGalleryAssetsPage({ albumId: recents.id });
      if (cancelled) return;
      setAssets(page.assets);
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [visible, resetSheet]);

  const loadAlbum = useCallback(async (album: GalleryAlbum) => {
    setSelectedAlbum(album);
    setAlbumMenuOpen(false);
    setLoading(true);
    setAssets([]);
    setEndCursor(undefined);
    try {
      const videosOnly = album.title.toLowerCase().includes("video");
      const page = await loadGalleryAssetsPage({ albumId: album.id, videosOnly });
      setAssets(page.assets);
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || loadingMore || loading || !selectedAlbum) return;
    setLoadingMore(true);
    try {
      const videosOnly = selectedAlbum.title.toLowerCase().includes("video");
      const page = await loadGalleryAssetsPage({
        albumId: selectedAlbum.id,
        after: endCursor,
        videosOnly,
      });
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const add = page.assets.filter((a) => !seen.has(a.id));
        return [...prev, ...add];
      });
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [endCursor, hasNextPage, loading, loadingMore, selectedAlbum]);

  const onGalleryScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!expandedRef.current && e.nativeEvent.contentOffset.y > 8) snapExpand();
  }, [snapExpand]);

  const pickAsset = useCallback((item: GalleryAsset) => {
    onPickAsset(item);
  }, [onPickAsset]);

  const renderCell = useCallback(({ item }: { item: GalleryAsset }) => (
    <TouchableOpacity
      style={[styles.cell, { width: CELL, height: CELL }]}
      activeOpacity={0.85}
      onPress={() => pickAsset(item)}
    >
      <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
      {item.kind === "video" ? (
        <View style={styles.videoBadge} pointerEvents="none">
          <Ionicons name="videocam" size={11} color="#fff" />
          <Text style={styles.videoDur}>{formatVideoDur(item.durationMs)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  ), [pickAsset]);

  const listHeader = useMemo(() => {
    if (expanded) return null;
    return (
      <View>
        <View style={styles.attachGrid}>
          {ATTACH_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.attachCell}
              activeOpacity={0.75}
              onPress={() => onAction(item.type)}
            >
              <View style={[styles.attachCircle, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon} size={26} color="#fff" />
              </View>
              <Text style={[styles.attachLabel, { color: colors.isDark ? "#E9EDEF" : "#3B4A54" }]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.viewOnceRow} onPress={() => onAction("viewonce")} activeOpacity={0.7}>
          <View style={[styles.attachCircleSm, { backgroundColor: "#6B7C8A" }]}>
            <Ionicons name="eye" size={18} color="#fff" />
          </View>
          <Text style={[styles.viewOnceText, { color: colors.primary }]}>View once photo or video</Text>
        </TouchableOpacity>
        <View style={[styles.galleryDivider, { borderTopColor: colors.isDark ? "#2A3942" : "#D1D7DB" }]} />
        <TouchableOpacity style={styles.expandHint} onPress={snapExpand} activeOpacity={0.8}>
          <Ionicons name="chevron-up" size={18} color={colors.mutedForeground} />
          <Text style={[styles.expandHintText, { color: colors.mutedForeground }]}>Swipe up for all photos</Text>
        </TouchableOpacity>
      </View>
    );
  }, [colors.isDark, colors.mutedForeground, colors.primary, expanded, onAction, snapExpand]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              backgroundColor: colors.isDark ? "#1A2329" : "#F0F2F5",
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={styles.handleRow} {...handlePan.panHandlers}>
            <View style={[styles.handle, { backgroundColor: colors.isDark ? "#3d4a54" : "#c4ccd4" }]} />
          </View>

          {expanded ? (
            <View style={styles.galleryToolbar}>
              <TouchableOpacity onPress={snapCollapse} hitSlop={12} style={styles.toolbarBtn}>
                <Ionicons name="chevron-down" size={26} color={colors.isDark ? "#E9EDEF" : "#111B21"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.albumBtn}
                onPress={() => setAlbumMenuOpen((v) => !v)}
                activeOpacity={0.75}
              >
                <Text style={[styles.albumTitle, { color: colors.isDark ? "#E9EDEF" : "#111B21" }]} numberOfLines={1}>
                  {selectedAlbum?.title ?? "Recents"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.isDark ? "#E9EDEF" : "#111B21"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={() => onAction("gallery")}
                hitSlop={8}
              >
                <Ionicons name="folder-open-outline" size={22} color={colors.isDark ? "#E9EDEF" : "#111B21"} />
              </TouchableOpacity>
            </View>
          ) : null}

          {Platform.OS === "web" ? (
            <View style={{ padding: 16 }}>
              {listHeader}
              <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 12 }}>
                Gallery preview is available in the mobile app.
              </Text>
            </View>
          ) : (
            <FlatList
              style={styles.galleryList}
              data={assets}
              key={selectedAlbum?.id ?? "recents"}
              keyExtractor={(item) => item.id}
              numColumns={GALLERY_COLS}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.gridPad}
              ListHeaderComponent={listHeader}
              renderItem={renderCell}
              onScroll={onGalleryScroll}
              scrollEventThrottle={16}
              onEndReached={() => void loadMore()}
              onEndReachedThreshold={0.4}
              showsVerticalScrollIndicator={expanded}
              nestedScrollEnabled
              ListEmptyComponent={
                loading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 32 }} />
                ) : (
                  <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                    Allow gallery access to see your photos here.
                  </Text>
                )
              }
              ListFooterComponent={
                loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null
              }
            />
          )}

        </Animated.View>
      </View>

      <Modal visible={albumMenuOpen} transparent animationType="fade" onRequestClose={() => setAlbumMenuOpen(false)}>
        <Pressable style={styles.albumMenuBackdrop} onPress={() => setAlbumMenuOpen(false)}>
          <View style={[styles.albumMenuCard, { backgroundColor: colors.isDark ? "#233138" : "#fff" }]}>
            <FlatList
              data={albums}
              keyExtractor={(a) => a.id || "recents"}
              style={{ maxHeight: SCREEN_H * 0.5 }}
              renderItem={({ item }) => {
                const selected = item.id === selectedAlbum?.id;
                return (
                  <TouchableOpacity
                    style={[styles.albumRow, selected && { backgroundColor: colors.isDark ? "#1a282f" : "#f0f9f6" }]}
                    onPress={() => void loadAlbum(item)}
                  >
                    <View style={[styles.albumThumb, { backgroundColor: colors.isDark ? "#2A3942" : "#e9edef" }]}>
                      <Ionicons name="images-outline" size={18} color={colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.albumRowTitle, { color: colors.isDark ? "#E9EDEF" : "#111B21" }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.albumRowCount, { color: colors.mutedForeground }]}>
                        {item.assetCount.toLocaleString()}
                      </Text>
                    </View>
                    {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
    overflow: "hidden",
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  handleRow: { alignItems: "center", paddingVertical: 8 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 10 },
  attachCell: { width: (SCREEN_W - 52) / 3, alignItems: "center", paddingVertical: 8 },
  attachCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  attachLabel: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  viewOnceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  attachCircleSm: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  viewOnceText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  galleryDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, marginBottom: 6 },
  galleryList: { flex: 1 },
  galleryToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 4,
  },
  toolbarBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  albumBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  albumTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", maxWidth: SCREEN_W * 0.5 },
  gridPad: { paddingHorizontal: 6, paddingBottom: 12 },
  row: { gap: GALLERY_GAP, marginBottom: GALLERY_GAP },
  cell: { borderRadius: 2, overflow: "hidden", backgroundColor: "#2A3942" },
  thumb: { width: "100%", height: "100%" },
  videoBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  videoDur: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  empty: { textAlign: "center", fontSize: 13, paddingVertical: 24, paddingHorizontal: 20 },
  expandHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  expandHintText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  albumMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-start",
    paddingTop: SCREEN_H * 0.14,
    paddingHorizontal: 28,
  },
  albumMenuCard: {
    borderRadius: 14,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  albumRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  albumThumb: { width: 40, height: 40, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  albumRowTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  albumRowCount: { fontSize: 12, marginTop: 1 },
});
