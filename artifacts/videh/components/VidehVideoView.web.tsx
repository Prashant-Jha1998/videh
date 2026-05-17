import { StyleSheet, View } from "react-native";
import React from "react";

export function VidehRemoteView({ style, nativeId }: { style?: any; nativeId?: string }) {
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

export function VidehLocalView({ style, nativeId }: { style?: any; nativeId?: string }) {
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    muted: true,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
