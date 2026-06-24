import React from "react";
import { StyleSheet, View } from "react-native";

function VideoElement({
  streamUrl,
  muted,
  mirror,
  pip,
  style,
  renderKey,
}: {
  streamUrl?: string;
  muted?: boolean;
  mirror?: boolean;
  pip?: boolean;
  style?: any;
  renderKey?: string;
}) {
  const url = typeof streamUrl === "string" ? streamUrl.trim() : "";
  if (!url) return <View style={[styles.fill, style]} />;
  const { RTCView } = require("react-native-webrtc");
  return (
    <RTCView
      key={renderKey ?? url}
      streamURL={url}
      objectFit="cover"
      mirror={mirror ?? false}
      zOrder={pip ? 1 : 0}
      style={[styles.fill, style]}
    />
  );
}

export function VidehRemoteView({
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
  return <VideoElement streamUrl={streamUrl} pip={pip} style={style} renderKey={renderKey} />;
}

export function VidehLocalView({
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
  return (
    <VideoElement
      streamUrl={streamUrl}
      muted
      mirror={mirror}
      pip={pip}
      style={style}
      renderKey={renderKey}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#111" },
});
