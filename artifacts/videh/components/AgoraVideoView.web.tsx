import { StyleSheet, View } from "react-native";
import React from "react";

interface Props {
  uid: number;
  isLocal?: boolean;
  style?: any;
  nativeId?: string;
}

export function AgoraRemoteView({ style, nativeId }: { style?: any; nativeId?: string }) {
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

export function AgoraLocalView({ style, nativeId }: { style?: any; nativeId?: string }) {
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
