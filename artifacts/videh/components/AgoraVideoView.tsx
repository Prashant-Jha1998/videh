import React from "react";
import { Platform, StyleSheet, View } from "react-native";

function VideoElement({ nativeId, muted, streamUrl, style }: { nativeId?: string; muted?: boolean; streamUrl?: string; style?: any }) {
  if (Platform.OS !== "web") {
    if (!streamUrl) return <View style={[styles.fill, style]} />;
    const { RTCView } = require("react-native-webrtc");
    return <RTCView streamURL={streamUrl} objectFit="cover" style={[styles.fill, style]} />;
  }
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    muted,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

export function AgoraRemoteView({ nativeId, streamUrl, style }: { uid?: number; nativeId?: string; streamUrl?: string; style?: any }) {
  return <VideoElement nativeId={nativeId} streamUrl={streamUrl} style={style} />;
}

export function AgoraLocalView({ nativeId, streamUrl, style }: { nativeId?: string; streamUrl?: string; style?: any }) {
  return <VideoElement nativeId={nativeId} streamUrl={streamUrl} muted style={style} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
