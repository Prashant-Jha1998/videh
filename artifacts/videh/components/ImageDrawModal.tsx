import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutRectangle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
import { computeDisplayBounds } from "@/lib/imageDisplayLayout";
import { getImageDimensions } from "@/lib/imageEdit";

export const DRAW_COLORS = ["#ffffff", "#ffeb3b", "#ff5252", "#4caf50", "#2196f3", "#000000"] as const;

type Stroke = {
  id: string;
  d: string;
  color: string;
  width: number;
  opacity: number;
};

function layoutNearlySame(a: LayoutRectangle | null, b: LayoutRectangle): boolean {
  if (!a) return false;
  return (
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1 &&
    Math.abs(a.x - b.x) < 1 &&
    Math.abs(a.y - b.y) < 1
  );
}

function pointsToD(points: { x: number; y: number }[]): string {
  if (points.length < 1) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

type Props = {
  visible: boolean;
  imageUri: string;
  onCancel: () => void;
  onDone: (uri: string) => void;
};

export function ImageDrawModal({ visible, imageUri, onCancel, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [container, setContainer] = useState<LayoutRectangle | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<string>(DRAW_COLORS[0]);
  const [highlight, setHighlight] = useState(true);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const activeStrokeId = useRef<string | null>(null);
  const strokeSeq = useRef(0);
  const captureRefView = useRef<View>(null);
  const [exporting, setExporting] = useState(false);
  const onCancelRef = useRef(onCancel);
  const displayBoundsRef = useRef<ReturnType<typeof computeDisplayBounds> | null>(null);
  const colorRef = useRef(color);
  const highlightRef = useRef(highlight);

  const displayBounds = useMemo(() => {
    if (!container || !imageSize) return null;
    return computeDisplayBounds(container, imageSize.width, imageSize.height);
  }, [container, imageSize]);

  onCancelRef.current = onCancel;
  displayBoundsRef.current = displayBounds;
  colorRef.current = color;
  highlightRef.current = highlight;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setStrokes([]);
    setImageSize(null);
    setContainer(null);
    currentPoints.current = [];
    activeStrokeId.current = null;
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

  const drawResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const bounds = displayBoundsRef.current;
        if (!bounds) return;
        const isHighlight = highlightRef.current;
        const strokeColor = colorRef.current;
        const width = isHighlight ? 16 : 5;
        const opacity = isHighlight ? 0.55 : 1;
        const { locationX, locationY } = evt.nativeEvent;
        const x = locationX - bounds.x;
        const y = locationY - bounds.y;
        if (x < 0 || y < 0 || x > bounds.w || y > bounds.h) return;
        currentPoints.current = [{ x, y }];
        const d = pointsToD(currentPoints.current);
        const id = `stroke-${++strokeSeq.current}`;
        activeStrokeId.current = id;
        setStrokes((prev) => [...prev, { id, d, color: strokeColor, width, opacity }]);
      },
      onPanResponderMove: (evt) => {
        const bounds = displayBoundsRef.current;
        const strokeId = activeStrokeId.current;
        if (!bounds || !strokeId || currentPoints.current.length === 0) return;
        const isHighlight = highlightRef.current;
        const strokeColor = colorRef.current;
        const width = isHighlight ? 16 : 5;
        const opacity = isHighlight ? 0.55 : 1;
        const { locationX, locationY } = evt.nativeEvent;
        const x = Math.max(0, Math.min(bounds.w, locationX - bounds.x));
        const y = Math.max(0, Math.min(bounds.h, locationY - bounds.y));
        const pts = currentPoints.current;
        const last = pts[pts.length - 1];
        if (Math.hypot(x - last.x, y - last.y) < 2) return;
        currentPoints.current = [...pts, { x, y }];
        const d = pointsToD(currentPoints.current);
        setStrokes((prev) => {
          const idx = prev.findIndex((s) => s.id === strokeId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { id: strokeId, d, color: strokeColor, width, opacity };
          return next;
        });
      },
      onPanResponderRelease: () => {
        currentPoints.current = [];
        activeStrokeId.current = null;
      },
      onPanResponderTerminate: () => {
        currentPoints.current = [];
        activeStrokeId.current = null;
      },
    }),
  ).current;

  const handleCanvasLayout = useCallback((layout: LayoutRectangle) => {
    setContainer((prev) => (layoutNearlySame(prev, layout) ? prev : layout));
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const handleDone = async () => {
    if (!captureRefView.current || !displayBounds || Platform.OS === "web") {
      onCancel();
      return;
    }
    setExporting(true);
    try {
      const uri = await captureRef(captureRefView, {
        format: "jpg",
        quality: 0.92,
        result: "tmpfile",
      });
      onDone(uri);
    } catch {
      onCancel();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onCancel} hitSlop={12} disabled={exporting}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Draw</Text>
          <TouchableOpacity onPress={() => void handleDone()} disabled={loading || exporting} hitSlop={12}>
            <Text style={[styles.done, (loading || exporting) && styles.doneDisabled]}>Done</Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.canvas}
          onLayout={(e) => handleCanvasLayout(e.nativeEvent.layout)}
          {...drawResponder.panHandlers}
        >
          {loading || !imageSize || !displayBounds ? (
            <ActivityIndicator color="#00a884" size="large" />
          ) : (
            <View
              ref={captureRefView}
              collapsable={false}
              style={{
                position: "absolute",
                left: displayBounds.x,
                top: displayBounds.y,
                width: displayBounds.w,
                height: displayBounds.h,
                backgroundColor: "#000",
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: displayBounds.w, height: displayBounds.h }}
                contentFit="fill"
                cachePolicy="memory-disk"
              />
              <Svg width={displayBounds.w} height={displayBounds.h} style={StyleSheet.absoluteFill}>
                {strokes.map((s) => (
                  <Path
                    key={s.id}
                    d={s.d}
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeOpacity={s.opacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </Svg>
            </View>
          )}
        </View>

        <View style={styles.toolRow}>
          <TouchableOpacity
            style={[styles.toolBtn, highlight && styles.toolBtnActive]}
            onPress={() => setHighlight(true)}
          >
            <Ionicons name="brush" size={22} color={highlight ? "#00a884" : "#fff"} />
            <Text style={[styles.toolLabel, highlight && styles.toolLabelActive]}>Highlight</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, !highlight && styles.toolBtnActive]}
            onPress={() => setHighlight(false)}
          >
            <Ionicons name="pencil" size={22} color={!highlight ? "#00a884" : "#fff"} />
            <Text style={[styles.toolLabel, !highlight && styles.toolLabelActive]}>Pen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={undo} disabled={strokes.length === 0}>
            <Ionicons name="arrow-undo" size={22} color={strokes.length === 0 ? "#54656f" : "#fff"} />
            <Text style={styles.toolLabel}>Undo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.colorRow}>
          {DRAW_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>

        <Text style={styles.hint}>Draw on the photo to highlight · Undo to remove last stroke</Text>
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
  toolRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  toolBtn: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1a2329",
    minWidth: 88,
  },
  toolBtnActive: { backgroundColor: "#0d2a24" },
  toolLabel: { color: "#8696a0", fontSize: 11, marginTop: 4, fontWeight: "600" },
  toolLabelActive: { color: "#00a884" },
  colorRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 14,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotSelected: { borderColor: "#00a884", transform: [{ scale: 1.12 }] },
  hint: {
    color: "#8696a0",
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 20,
  },
});
