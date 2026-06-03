import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { VidehRemoteView } from "@/components/VidehVideoView";

export type RemoteCallPeer = {
  peerId: number;
  name: string;
  streamUrl?: string;
  hasVideo: boolean;
};

type Props = {
  peers: RemoteCallPeer[];
  placeholderColor?: string;
};

function tileLayout(count: number): { flexBasis: string; minHeight: number } {
  if (count <= 1) return { flexBasis: "100%", minHeight: 200 };
  if (count <= 4) return { flexBasis: "50%", minHeight: 160 };
  if (count <= 9) return { flexBasis: "33.33%", minHeight: 120 };
  return { flexBasis: "25%", minHeight: 96 };
}

export function GroupCallGrid({ peers }: Props) {
  if (peers.length === 0) return null;

  const layout = tileLayout(peers.length);

  return (
    <View style={styles.grid}>
      {peers.map((p) => {
        const initials = p.name.slice(0, 2).toUpperCase();
        const hue = (p.name.charCodeAt(0) || 32) * 37 % 360;
        return (
          <View
            key={p.peerId}
            style={[styles.tile, { flexBasis: layout.flexBasis, maxWidth: layout.flexBasis, minHeight: layout.minHeight }]}
          >
            {p.hasVideo && p.streamUrl ? (
              <VidehRemoteView streamUrl={p.streamUrl} style={styles.video} />
            ) : (
              <View style={[styles.placeholder, { backgroundColor: `hsl(${hue},48%,38%)` }]}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
            <View style={styles.nameBar}>
              <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", width: "100%" },
  tile: { flexGrow: 1, aspectRatio: 0.85, padding: 4, minHeight: 140 },
  video: { flex: 1, borderRadius: 12, overflow: "hidden" },
  placeholder: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#333",
  },
  initials: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  nameBar: {
    position: "absolute",
    left: 8,
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  name: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
