import React, { type ReactNode } from "react";
import { Modal, type ModalProps, Pressable, StyleSheet, View } from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  animationType?: ModalProps["animationType"];
  /** Scrim opacity 0–1 (default 0.45) */
  backdropOpacity?: number;
};

/**
 * Standard overlay: tap dimmed area to close + Android hardware back via onRequestClose.
 * Put positioned content in `children` (e.g. flex-end sheet or centered card).
 */
export function DismissibleModal({
  visible,
  onClose,
  children,
  animationType = "fade",
  backdropOpacity = 0.45,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${backdropOpacity})` }]}
          onPress={onClose}
          accessibilityLabel="Dismiss"
        />
        <View style={styles.layer} pointerEvents="box-none">
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject },
  layer: { ...StyleSheet.absoluteFillObject },
});
