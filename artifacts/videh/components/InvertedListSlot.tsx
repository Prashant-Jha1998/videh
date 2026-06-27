import React from "react";
import { StyleSheet, View } from "react-native";

/** Counter-flip a row/chrome inside an inverted FlatList so text renders upright. */
export function InvertedListSlot({ children }: { children: React.ReactNode }) {
  return <View style={styles.slot}>{children}</View>;
}

const styles = StyleSheet.create({
  slot: { transform: [{ scaleY: -1 }] },
});
