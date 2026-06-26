import React from "react";
import { StyleSheet, View } from "react-native";

/** Counter-flip chrome placed in an inverted FlatList header/footer/empty slot. */
export function InvertedListSlot({ children }: { children: React.ReactNode }) {
  return <View style={styles.slot}>{children}</View>;
}

const styles = StyleSheet.create({
  slot: { transform: [{ scaleY: -1 }] },
});
