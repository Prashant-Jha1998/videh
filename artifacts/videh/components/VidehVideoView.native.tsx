import React from "react";
import { StyleSheet, View } from "react-native";

function VideoElement({ streamUrl, muted, style }: { streamUrl?: string; muted?: boolean; style?: any }) {
  const url = typeof streamUrl === "string" ? streamUrl.trim() : "";
  if (!url) return <View style={[styles.fill, style]} />;
  const { RTCView } = require("react-native-webrtc");
  return (
    <RTCView
      key={url}
      streamURL={url}
      objectFit="cover"
      mirror={Boolean(muted)}
      zOrder={muted ? 1 : 0}
      style={[styles.fill, style]}
    />
  );
}

export function VidehRemoteView({ streamUrl, style }: { uid?: number; nativeId?: string; streamUrl?: string; style?: any }) {
  return <VideoElement streamUrl={streamUrl} style={style} />;
}

export function VidehLocalView({ streamUrl, style }: { nativeId?: string; streamUrl?: string; style?: any }) {
  return <VideoElement streamUrl={streamUrl} muted style={style} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#111" },
});
