import React from "react";
import { Platform, StyleSheet, View } from "react-native";

function VideoElement({ nativeId, muted, mirror, streamUrl, style }: { nativeId?: string; muted?: boolean; mirror?: boolean; streamUrl?: string; style?: any }) {
  if (Platform.OS !== "web") {
    if (!streamUrl) return <View style={[styles.fill, style]} />;
    const { RTCView } = require("react-native-webrtc");
    return <RTCView streamURL={streamUrl} objectFit="cover" mirror={mirror ?? Boolean(muted)} style={[styles.fill, style]} />;
  }
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    muted,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

export function VidehRemoteView({ nativeId, streamUrl, style }: { uid?: number; nativeId?: string; streamUrl?: string; style?: any }) {
  return <VideoElement nativeId={nativeId} streamUrl={streamUrl} style={style} />;
}

export function VidehLocalView({
  nativeId,
  streamUrl,
  style,
  mirror = true,
}: {
  nativeId?: string;
  streamUrl?: string;
  style?: any;
  mirror?: boolean;
}) {
  return <VideoElement nativeId={nativeId} streamUrl={streamUrl} muted mirror={mirror} style={style} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
