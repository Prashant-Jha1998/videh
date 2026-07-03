import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  businessName: string;
  onClose: () => void;
  onConfirmStop: () => void;
  onBlockInstead: () => void;
  busy?: boolean;
};

export function StopBusinessMessagesSheet({
  visible,
  businessName,
  onClose,
  onConfirmStop,
  onBlockInstead,
  busy,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#54656F" />
          </TouchableOpacity>

          <Text style={styles.title}>
            Stop offers and announcements from {businessName}?
          </Text>
          <Text style={styles.body}>
            We&apos;ll tell this business you want to stop getting messages like this on Videh.{" "}
            <Text style={styles.learnMore}>Learn more</Text>
          </Text>

          <TouchableOpacity
            style={[styles.stopBtn, busy && styles.stopBtnDisabled]}
            onPress={onConfirmStop}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.stopBtnText}>{busy ? "Stopping…" : "Stop"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.blockBtn} onPress={onBlockInstead} disabled={busy}>
            <Ionicons name="ban-outline" size={18} color="#EA0038" />
            <Text style={styles.blockBtnText}>Block instead</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#3B4A54",
    lineHeight: 24,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    lineHeight: 20,
    marginBottom: 24,
  },
  learnMore: {
    color: "#059669",
    fontFamily: "Inter_500Medium",
  },
  stopBtn: {
    backgroundColor: "#059669",
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  stopBtnDisabled: { opacity: 0.65 },
  stopBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  blockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  blockBtnText: {
    color: "#EA0038",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
