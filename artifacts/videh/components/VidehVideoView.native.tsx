import React from "react";
import { StyleSheet, View } from "react-native";

function VideoElement({
  streamUrl,
  muted,
  mirror,
  style,
}: {
  streamUrl?: string;
  muted?: boolean;
  mirror?: boolean;
  style?: any;
}) {
  const url = typeof streamUrl === "string" ? streamUrl.trim() : "";
  if (!url) return <View style={[styles.fill, style]} />;
  const { RTCView } = require("react-native-webrtc");
  return (
    <RTCView
      key={url}
      streamURL={url}
      objectFit="cover"
      mirror={mirror ?? Boolean(muted)}
      zOrder={muted ? 1 : 0}
      style={[styles.fill, style]}
    />
  );
}

export function VidehRemoteView({ streamUrl, style }: { uid?: number; nativeId?: string; streamUrl?: string; style?: any }) {
  return <VideoElement streamUrl={streamUrl} style={style} />;
}

export function VidehLocalView({
  streamUrl,
  style,
  mirror = true,
}: {
  nativeId?: string;
  streamUrl?: string;
  style?: any;
  mirror?: boolean;
}) {
  return <VideoElement streamUrl={streamUrl} muted mirror={mirror} style={style} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#111" },
});
