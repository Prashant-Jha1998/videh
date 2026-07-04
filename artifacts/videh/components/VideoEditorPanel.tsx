import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import React, { useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  VIDEO_FILTER_OPTIONS,
  defaultEditorMetadata,
  filterOverlayColor,
  newTextOverlay,
  type SelectedSound,
  type VideoEditorMetadata,
  type VideoFilterId,
  type VideoTextOverlay,
} from "@/lib/videoEditor";
import { VIBE_BRAND_NAME } from "@/lib/vibeVideo";

type Props = {
  videoUri: string;
  durationSec: number;
  isVibeFormat: boolean;
  editor: VideoEditorMetadata;
  selectedSound: SelectedSound | null;
  onChange: (next: VideoEditorMetadata) => void;
  onOpenSounds: () => void;
};

function DraggableText({
  overlay,
  frameW,
  frameH,
  active,
  onPress,
  onMove,
}: {
  overlay: VideoTextOverlay;
  frameW: number;
  frameH: number;
  active: boolean;
  onPress: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const start = useRef({ x: overlay.x, y: overlay.y });
  const responder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { x: overlay.x, y: overlay.y };
        onPress();
      },
      onPanResponderMove: (_evt, g) => {
        const nx = Math.min(0.92, Math.max(0.02, start.current.x + g.dx / Math.max(frameW, 1)));
        const ny = Math.min(0.88, Math.max(0.05, start.current.y + g.dy / Math.max(frameH, 1)));
        onMove(nx, ny);
      },
    }),
    [overlay.x, overlay.y, frameW, frameH, onMove, onPress],
  );

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.textOverlay,
        {
          left: overlay.x * frameW,
          top: overlay.y * frameH,
          borderColor: active ? "#fff" : "transparent",
        },
      ]}
    >
      <Text style={{ color: overlay.color, fontSize: overlay.fontSize, fontFamily: "Inter_700Bold" }}>
        {overlay.text || "Text"}
      </Text>
    </View>
  );
}

export function VideoEditorPanel({
  videoUri,
  durationSec,
  isVibeFormat,
  editor,
  selectedSound,
  onChange,
  onOpenSounds,
}: Props) {
  const colors = useColors();
  const [frameSize, setFrameSize] = useState({ w: 280, h: 420 });
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const activeOverlay = editor.textOverlays.find((t) => t.id === activeTextId) ?? null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setFrameSize({ w: width, h: height });
  };

  const setFilter = (filter: VideoFilterId) => onChange({ ...editor, filter });
  const setCaption = (caption: string) => onChange({ ...editor, caption });

  const addText = () => {
    const overlay = newTextOverlay();
    onChange({ ...editor, textOverlays: [...editor.textOverlays, overlay] });
    setActiveTextId(overlay.id);
  };

  const updateOverlay = (id: string, patch: Partial<VideoTextOverlay>) => {
    onChange({
      ...editor,
      textOverlays: editor.textOverlays.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const removeActiveText = () => {
    if (!activeTextId) return;
    onChange({ ...editor, textOverlays: editor.textOverlays.filter((t) => t.id !== activeTextId) });
    setActiveTextId(null);
  };

  const filterTint = filterOverlayColor(editor.filter);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.section, { color: colors.foreground }]}>Edit {isVibeFormat ? VIBE_BRAND_NAME : "Watch"}</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Drag text anywhere · Filters preview on upload · {durationSec}s clip
      </Text>

      <View
        style={[styles.frame, { backgroundColor: "#111", borderColor: colors.border }]}
        onLayout={onLayout}
      >
        {videoUri ? (
          <Video
            source={{ uri: videoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={isVibeFormat ? ResizeMode.COVER : ResizeMode.CONTAIN}
            shouldPlay={false}
            isLooping={false}
            isMuted
            useNativeControls={isVibeFormat}
            onError={() => { /* swallow preview errors */ }}
          />
        ) : null}
        {filterTint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: filterTint }]} pointerEvents="none" /> : null}
        {editor.textOverlays.map((o) => (
          <DraggableText
            key={o.id}
            overlay={o}
            frameW={frameSize.w}
            frameH={frameSize.h}
            active={o.id === activeTextId}
            onPress={() => setActiveTextId(o.id)}
            onMove={(x, y) => updateOverlay(o.id, { x, y })}
          />
        ))}
        {editor.caption ? (
          <View style={styles.captionBar} pointerEvents="none">
            <Text style={styles.captionText} numberOfLines={2}>{editor.caption}</Text>
          </View>
        ) : null}
        {selectedSound && !isVibeFormat ? (
          <View style={styles.soundChip} pointerEvents="none">
            <Ionicons name="musical-notes" size={14} color="#fff" />
            <Text style={styles.soundChipText} numberOfLines={1}>{selectedSound.title}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolRow} contentContainerStyle={{ gap: 8 }}>
        {!isVibeFormat ? (
          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: colors.muted }]} onPress={onOpenSounds}>
            <Ionicons name="musical-notes-outline" size={20} color={colors.foreground} />
            <Text style={[styles.toolLabel, { color: colors.foreground }]}>Sound</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[styles.toolBtn, { backgroundColor: colors.muted }]} onPress={addText}>
          <Ionicons name="text-outline" size={20} color={colors.foreground} />
          <Text style={[styles.toolLabel, { color: colors.foreground }]}>Text</Text>
        </TouchableOpacity>
        {activeOverlay ? (
          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: colors.muted }]} onPress={removeActiveText}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={[styles.toolLabel, { color: "#EF4444" }]}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {activeOverlay ? (
        <TextInput
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
          value={activeOverlay.text}
          onChangeText={(text) => updateOverlay(activeOverlay.id, { text })}
          placeholder="Overlay text"
          placeholderTextColor={colors.mutedForeground}
          maxLength={120}
        />
      ) : null}

      <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>Caption</Text>
      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        value={editor.caption}
        onChangeText={setCaption}
        placeholder="Short caption shown on the clip"
        placeholderTextColor={colors.mutedForeground}
        maxLength={200}
      />

      <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>Filter</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {VIDEO_FILTER_OPTIONS.map((f) => {
          const on = editor.filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.filterChip,
                { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "18" : colors.card },
              ]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export { defaultEditorMetadata };

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  section: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 18 },
  frame: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 360,
    alignSelf: "center",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 12,
  },
  textOverlay: {
    position: "absolute",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 6,
    maxWidth: "88%",
  },
  captionBar: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  captionText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  soundChip: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: "70%",
  },
  soundChipText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  toolRow: { marginBottom: 10 },
  toolBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 72,
    gap: 4,
  },
  toolLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  subLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
});
