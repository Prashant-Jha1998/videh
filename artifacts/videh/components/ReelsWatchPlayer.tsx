import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  applyQualityToPlaybackUrl,
  qualityLabel,
  type ReelsVideoQuality,
} from "@/lib/reelsVideoQuality";

const DOUBLE_TAP_MS = 320;
const SEEK_SECONDS = 10;

type Props = {
  videoId: number;
  baseUrl: string;
  quality: ReelsVideoQuality;
  sourceHeight?: number | null;
  qualities: ReelsVideoQuality[];
  paused?: boolean;
  onQualityChange: (q: ReelsVideoQuality) => void;
};

function ReelsWatchPlayerInner({
  videoId,
  baseUrl,
  quality,
  qualities,
  paused = false,
  onQualityChange,
}: Props) {
  const playbackUrl = applyQualityToPlaybackUrl(baseUrl, quality);
  const player = useVideoPlayer(playbackUrl, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const autoPlayedRef = useRef(false);
  const lastTapRef = useRef<{ side: "left" | "right"; at: number } | null>(null);
  const [skipHint, setSkipHint] = useState<{ side: "left" | "right"; seconds: number } | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    autoPlayedRef.current = false;
  }, [videoId, playbackUrl]);

  useFocusEffect(
    useCallback(() => () => {
      player.pause();
    }, [player]),
  );

  useEffect(() => () => {
    player.pause();
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
  }, [player]);

  useEffect(() => {
    if (paused) {
      player.pause();
      return;
    }
    if (status === "readyToPlay" && !autoPlayedRef.current) {
      autoPlayedRef.current = true;
      player.play();
    }
  }, [paused, status, player]);

  const flashSkipHint = useCallback((side: "left" | "right", seconds: number) => {
    setSkipHint({ side, seconds });
    hintOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(hintOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(hintOpacity, { toValue: 0, duration: 520, delay: 280, useNativeDriver: true }),
    ]).start(() => setSkipHint(null));
  }, [hintOpacity]);

  const handleSidePress = useCallback((side: "left" | "right") => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.side === side && now - last.at <= DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      player.seekBy(side === "right" ? SEEK_SECONDS : -SEEK_SECONDS);
      flashSkipHint(side, SEEK_SECONDS);
      return;
    }
    lastTapRef.current = { side, at: now };
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      lastTapRef.current = null;
    }, DOUBLE_TAP_MS + 40);
  }, [player, flashSkipHint]);

  const activeQualityLabel = quality === "auto" ? "Auto" : qualityLabel(quality);

  return (
    <View style={styles.wrap}>
      <VideoView
        key={`watch-player-${videoId}-${quality}`}
        style={styles.player}
        player={player}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: true, orientation: "landscape" }}
      />

      <View style={styles.tapLayer} pointerEvents="box-none">
        <Pressable style={styles.tapLeft} onPress={() => handleSidePress("left")} />
        <View style={styles.tapCenter} pointerEvents="none" />
        <Pressable style={styles.tapRight} onPress={() => handleSidePress("right")} />
      </View>

      {skipHint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.skipHint,
            skipHint.side === "left" ? styles.skipHintLeft : styles.skipHintRight,
            { opacity: hintOpacity },
          ]}
        >
          <Ionicons
            name={skipHint.side === "left" ? "play-back" : "play-forward"}
            size={28}
            color="#fff"
          />
          <Text style={styles.skipHintText}>{skipHint.seconds} sec</Text>
        </Animated.View>
      ) : null}

      <TouchableOpacity
        style={[styles.qualityBtn, { top: insets.top + 6 }]}
        onPress={() => setQualityOpen(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Video quality"
      >
        <Ionicons name="settings-outline" size={20} color="#fff" />
        <Text style={styles.qualityBtnText}>{activeQualityLabel}</Text>
      </TouchableOpacity>

      <Modal visible={qualityOpen} transparent animationType="slide" onRequestClose={() => setQualityOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetScrim} onPress={() => setQualityOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              Quality for current video
              {quality !== "auto" ? (
                <Text style={styles.sheetTitleActive}> · {qualityLabel(quality)}</Text>
              ) : null}
            </Text>
            {qualities.map((q) => {
              const selected = q === quality;
              return (
                <TouchableOpacity
                  key={String(q)}
                  style={styles.qualityRow}
                  onPress={() => {
                    onQualityChange(q);
                    setQualityOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.qualityRowText, selected && styles.qualityRowTextActive]}>
                    {qualityLabel(q)}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={22} color="#00A884" /> : null}
                </TouchableOpacity>
              );
            })}
            <Text style={styles.sheetFoot}>
              This selection only applies to the current video. Each video remembers its own quality, like YouTube.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const ReelsWatchPlayer = React.memo(ReelsWatchPlayerInner);

const styles = StyleSheet.create({
  wrap: { position: "relative", backgroundColor: "#000" },
  player: { width: "100%", aspectRatio: 16 / 9 },
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  tapLeft: { flex: 0.38 },
  tapCenter: { flex: 0.24 },
  tapRight: { flex: 0.38 },
  skipHint: {
    position: "absolute",
    top: "38%",
    alignItems: "center",
    justifyContent: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  skipHintLeft: { left: "14%" },
  skipHintRight: { right: "14%" },
  skipHintText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 4 },
  qualityBtn: {
    position: "absolute",
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 18,
  },
  qualityBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111",
    marginBottom: 8,
  },
  sheetTitleActive: { color: "#667781", fontFamily: "Inter_500Medium" },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  qualityRowText: { fontSize: 16, fontFamily: "Inter_400Regular", color: "#111" },
  qualityRowTextActive: { fontFamily: "Inter_700Bold", color: "#00A884" },
  sheetFoot: {
    fontSize: 12,
    color: "#667781",
    lineHeight: 17,
    marginTop: 12,
    marginBottom: 4,
  },
});
