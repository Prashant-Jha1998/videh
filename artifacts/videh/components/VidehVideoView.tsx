import React from "react";
import { Platform, StyleSheet, View } from "react-native";

function VideoElement({ nativeId, muted, mirror, pip, streamUrl, style, renderKey }: { nativeId?: string; muted?: boolean; mirror?: boolean; pip?: boolean; streamUrl?: string; style?: any; renderKey?: string }) {
  if (Platform.OS !== "web") {
    if (!streamUrl) return <View style={[styles.fill, style]} />;
    const { RTCView } = require("react-native-webrtc");
    return (
      <RTCView
        key={renderKey ?? streamUrl}
        streamURL={streamUrl}
        objectFit="cover"
        mirror={mirror ?? false}
        zOrder={pip ? 1 : 0}
        style={[styles.fill, style]}
      />
    );
  }
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    muted,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

export function VidehRemoteView({
  nativeId,
  streamUrl,
  style,
  pip,
  renderKey,
}: {
  uid?: number;
  nativeId?: string;
  streamUrl?: string;
  style?: any;
  pip?: boolean;
  renderKey?: string;
}) {
  return <VideoElement nativeId={nativeId} streamUrl={streamUrl} pip={pip} style={style} renderKey={renderKey} />;
}

export function VidehLocalView({
  nativeId,
  streamUrl,
  style,
  mirror = true,
  pip,
  renderKey,
}: {
  nativeId?: string;
  streamUrl?: string;
  style?: any;
  mirror?: boolean;
  pip?: boolean;
  renderKey?: string;
}) {
  return <VideoElement nativeId={nativeId} streamUrl={streamUrl} muted mirror={mirror} pip={pip} style={style} renderKey={renderKey} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
