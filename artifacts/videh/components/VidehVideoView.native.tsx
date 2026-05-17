import React from "react";
import { StyleSheet, View } from "react-native";

function VideoElement({ streamUrl, muted, style }: { streamUrl?: string; muted?: boolean; style?: any }) {
  if (!streamUrl) return <View style={[styles.fill, style]} />;
  const { RTCView } = require("react-native-webrtc");
  return <RTCView streamURL={streamUrl} objectFit="cover" mirror={Boolean(muted)} style={[styles.fill, style]} />;
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
