import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutRectangle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { computeDisplayBounds } from "@/lib/imageDisplayLayout";
import { clampCropRect, getImageDimensions, type CropRect } from "@/lib/imageEdit";

const MIN_CROP_PX = 72;
const HANDLE_HIT = 36;

type DisplayCrop = { x: number; y: number; w: number; h: number };
type DisplayBounds = { x: number; y: number; w: number; h: number };
type HandleId =
  | "move"
  | "tl"
  | "tr"
  | "bl"
  | "br"
  | "t"
  | "b"
  | "l"
  | "r";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fullCrop(bounds: DisplayBounds): DisplayCrop {
  return { x: 0, y: 0, w: bounds.w, h: bounds.h };
}

function adjustCrop(
  start: DisplayCrop,
  handle: HandleId,
  dx: number,
  dy: number,
  bounds: DisplayBounds,
): DisplayCrop {
  let { x, y, w, h } = start;
  const maxW = bounds.w;
  const maxH = bounds.h;

  switch (handle) {
    case "move": {
      x = clamp(x + dx, 0, maxW - w);
      y = clamp(y + dy, 0, maxH - h);
      break;
    }
    case "br": {
      w = clamp(w + dx, MIN_CROP_PX, maxW - x);
      h = clamp(h + dy, MIN_CROP_PX, maxH - y);
      break;
    }
    case "bl": {
      const nw = clamp(w - dx, MIN_CROP_PX, x + w);
      x = x + w - nw;
      w = nw;
      h = clamp(h + dy, MIN_CROP_PX, maxH - y);
      break;
    }
    case "tr": {
      w = clamp(w + dx, MIN_CROP_PX, maxW - x);
      const nh = clamp(h - dy, MIN_CROP_PX, y + h);
      y = y + h - nh;
      h = nh;
      break;
    }
    case "tl": {
      const nw = clamp(w - dx, MIN_CROP_PX, x + w);
      x = x + w - nw;
      w = nw;
      const nh = clamp(h - dy, MIN_CROP_PX, y + h);
      y = y + h - nh;
      h = nh;
      break;
    }
    case "t": {
      const nh = clamp(h - dy, MIN_CROP_PX, y + h);
      y = y + h - nh;
      h = nh;
      break;
    }
    case "b": {
      h = clamp(h + dy, MIN_CROP_PX, maxH - y);
      break;
    }
    case "l": {
      const nw = clamp(w - dx, MIN_CROP_PX, x + w);
      x = x + w - nw;
      w = nw;
      break;
    }
    case "r": {
      w = clamp(w + dx, MIN_CROP_PX, maxW - x);
      break;
    }
    default:
      break;
  }

  return { x, y, w, h };
}

function layoutNearlySame(a: LayoutRectangle | null, b: LayoutRectangle): boolean {
  if (!a) return false;
  return (
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1 &&
    Math.abs(a.x - b.x) < 1 &&
    Math.abs(a.y - b.y) < 1
  );
}

function displayCropToPixels(crop: DisplayCrop, bounds: DisplayBounds, imageW: number, imageH: number): CropRect {
  const rect = {
    originX: Math.round((crop.x / bounds.w) * imageW),
    originY: Math.round((crop.y / bounds.h) * imageH),
    width: Math.round((crop.w / bounds.w) * imageW),
    height: Math.round((crop.h / bounds.h) * imageH),
  };
  return clampCropRect(rect, imageW, imageH);
}

/** Pick handle from touch in container coordinates. */
function hitTestHandle(
  touchX: number,
  touchY: number,
  crop: DisplayCrop,
  bounds: DisplayBounds,
): HandleId {
  const left = bounds.x + crop.x;
  const top = bounds.y + crop.y;
  const right = left + crop.w;
  const bottom = top + crop.h;
  const h = HANDLE_HIT / 2;

  const near = (px: number, py: number) => Math.abs(touchX - px) <= h && Math.abs(touchY - py) <= h;

  if (near(left, top)) return "tl";
  if (near(right, top)) return "tr";
  if (near(left, bottom)) return "bl";
  if (near(right, bottom)) return "br";
  if (Math.abs(touchY - top) <= h && touchX >= left && touchX <= right) return "t";
  if (Math.abs(touchY - bottom) <= h && touchX >= left && touchX <= right) return "b";
  if (Math.abs(touchX - left) <= h && touchY >= top && touchY <= bottom) return "l";
  if (Math.abs(touchX - right) <= h && touchY >= top && touchY <= bottom) return "r";
  if (touchX >= left && touchX <= right && touchY >= top && touchY <= bottom) return "move";
  return "move";
}

type Props = {
  visible: boolean;
  imageUri: string;
  onCancel: () => void;
  onDone: (rect: CropRect) => void;
};

export function ManualImageCropModal({ visible, imageUri, onCancel, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [container, setContainer] = useState<LayoutRectangle | null>(null);
  const [crop, setCrop] = useState<DisplayCrop | null>(null);
  const cropRef = useRef<DisplayCrop | null>(null);
  const startCropRef = useRef<DisplayCrop | null>(null);
  const activeHandleRef = useRef<HandleId>("move");
  const cropInitializedRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  const displayBoundsRef = useRef<DisplayBounds | null>(null);
  cropRef.current = crop;

  const displayBounds = useMemo(() => {
    if (!container || !imageSize) return null;
    return computeDisplayBounds(container, imageSize.width, imageSize.height);
  }, [container, imageSize]);

  onCancelRef.current = onCancel;
  displayBoundsRef.current = displayBounds;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setCrop(null);
    setImageSize(null);
    setContainer(null);
    cropInitializedRef.current = false;
    void (async () => {
      try {
        const size = await getImageDimensions(imageUri);
        if (!cancelled) setImageSize(size);
      } catch {
        if (!cancelled) onCancelRef.current();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, imageUri]);

  useEffect(() => {
    if (!visible || !displayBounds || cropInitializedRef.current) return;
    cropInitializedRef.current = true;
    setCrop(fullCrop(displayBounds));
  }, [visible, displayBounds]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const c = cropRef.current;
        const bounds = displayBoundsRef.current;
        if (!c || !bounds) return;
        activeHandleRef.current = hitTestHandle(
          evt.nativeEvent.locationX,
          evt.nativeEvent.locationY,
          c,
          bounds,
        );
        startCropRef.current = c;
      },
      onPanResponderMove: (_, gesture) => {
        const start = startCropRef.current;
        const bounds = displayBoundsRef.current;
        if (!start || !bounds) return;
        setCrop(adjustCrop(start, activeHandleRef.current, gesture.dx, gesture.dy, bounds));
      },
    }),
  ).current;

  const handleCanvasLayout = useCallback((layout: LayoutRectangle) => {
    setContainer((prev) => (layoutNearlySame(prev, layout) ? prev : layout));
  }, []);

  const handleDone = () => {
    if (!crop || !displayBounds || !imageSize) return;
    onDone(displayCropToPixels(crop, displayBounds, imageSize.width, imageSize.height));
  };

  const absCrop = useMemo(() => {
    if (!crop || !displayBounds) return null;
    return {
      left: displayBounds.x + crop.x,
      top: displayBounds.y + crop.y,
      width: crop.w,
      height: crop.h,
    };
  }, [crop, displayBounds]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onCancel} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Crop</Text>
          <TouchableOpacity onPress={handleDone} disabled={loading || !crop} hitSlop={12}>
            <Text style={[styles.done, (loading || !crop) && styles.doneDisabled]}>Done</Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.canvas}
          onLayout={(e) => handleCanvasLayout(e.nativeEvent.layout)}
          {...(!loading && crop && displayBounds ? panResponder.panHandlers : {})}
        >
          {loading || !imageSize || !displayBounds ? (
            <ActivityIndicator color="#00a884" size="large" />
          ) : (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: displayBounds.x,
                  top: displayBounds.y,
                  width: displayBounds.w,
                  height: displayBounds.h,
                }}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: displayBounds.w, height: displayBounds.h }}
                  contentFit="fill"
                  cachePolicy="memory-disk"
                />
              </View>

              {absCrop ? (
                <>
                  <View style={[styles.dim, { left: 0, top: 0, right: 0, height: absCrop.top }]} pointerEvents="none" />
                  <View
                    style={[styles.dim, { left: 0, top: absCrop.top + absCrop.height, right: 0, bottom: 0 }]}
                    pointerEvents="none"
                  />
                  <View
                    style={[styles.dim, { left: 0, top: absCrop.top, width: absCrop.left, height: absCrop.height }]}
                    pointerEvents="none"
                  />
                  <View
                    style={[
                      styles.dim,
                      { left: absCrop.left + absCrop.width, top: absCrop.top, right: 0, height: absCrop.height },
                    ]}
                    pointerEvents="none"
                  />

                  <View
                    pointerEvents="none"
                    style={[
                      styles.cropBox,
                      {
                        left: absCrop.left,
                        top: absCrop.top,
                        width: absCrop.width,
                        height: absCrop.height,
                      },
                    ]}
                  >
                    {[1 / 3, 2 / 3].map((f) => (
                      <React.Fragment key={`g-${f}`}>
                        <View
                          style={[styles.gridLine, { left: `${f * 100}%`, top: 0, bottom: 0, width: 1 }]}
                        />
                        <View
                          style={[styles.gridLine, { top: `${f * 100}%`, left: 0, right: 0, height: 1 }]}
                        />
                      </React.Fragment>
                    ))}
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                    <View style={[styles.edgeBar, styles.edgeT]} />
                    <View style={[styles.edgeBar, styles.edgeB]} />
                    <View style={[styles.edgeBar, styles.edgeL]} />
                    <View style={[styles.edgeBar, styles.edgeR]} />
                  </View>
                </>
              ) : null}
            </>
          )}
        </View>

        <Text style={styles.hint}>Drag inside to move · Drag corners or edges to resize</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "600" },
  done: { color: "#00a884", fontSize: 17, fontWeight: "700" },
  doneDisabled: { opacity: 0.4 },
  canvas: { flex: 1, backgroundColor: "#000" },
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropBox: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  gridLine: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "#fff",
  },
  cornerTL: { left: -1, top: -1, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { right: -1, top: -1, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { left: -1, bottom: -1, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { right: -1, bottom: -1, borderBottomWidth: 4, borderRightWidth: 4 },
  edgeBar: {
    position: "absolute",
    backgroundColor: "#fff",
  },
  edgeT: { top: -2, left: "35%", right: "35%", height: 4, borderRadius: 2 },
  edgeB: { bottom: -2, left: "35%", right: "35%", height: 4, borderRadius: 2 },
  edgeL: { left: -2, top: "35%", bottom: "35%", width: 4, borderRadius: 2 },
  edgeR: { right: -2, top: "35%", bottom: "35%", width: 4, borderRadius: 2 },
  hint: {
    color: "#8696a0",
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
