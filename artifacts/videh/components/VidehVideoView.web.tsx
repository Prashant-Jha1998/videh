import { StyleSheet, View } from "react-native";
import React from "react";

type RemoteProps = {
  style?: any;
  nativeId?: string;
  uid?: number;
  streamUrl?: string;
  pip?: boolean;
  renderKey?: string;
};

type LocalProps = {
  style?: any;
  nativeId?: string;
  streamUrl?: string;
  mirror?: boolean;
  pip?: boolean;
  renderKey?: string;
};

export function VidehRemoteView({ style, nativeId }: RemoteProps) {
  return React.createElement("video", {
    id: nativeId,
    autoPlay: true,
    playsInline: true,
    style: StyleSheet.flatten([styles.fill, style]),
  });
}

export function VidehLocalView({ style, nativeId }: LocalProps) {
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
