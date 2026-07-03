import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  businessName: string;
  isMuted: boolean;
  onClose: () => void;
  onToggleMute: (muted: boolean) => void;
  onBlock: () => void;
};

export function ManageBusinessMessagesSheet({
  visible,
  businessName,
  isMuted,
  onClose,
  onToggleMute,
  onBlock,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHeader}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#54656F" />
            </TouchableOpacity>
            <View style={styles.titleCol}>
              <Text style={styles.sheetTitle}>Manage messages</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>{businessName}</Text>
            </View>
            <View style={styles.closeBtn} />
          </View>

          <View style={styles.menuBlock}>
            <View style={styles.menuRow}>
              <Ionicons name="notifications-outline" size={22} color="#14131F" />
              <View style={styles.menuTextCol}>
                <Text style={styles.menuLabel}>Notifications</Text>
                <Text style={styles.menuHint}>Mute or unmute messages from this business</Text>
              </View>
              <Switch
                value={!isMuted}
                onValueChange={(on) => onToggleMute(!on)}
                trackColor={{ false: "#CBD5E1", true: "#059669" }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuRow} onPress={onBlock} activeOpacity={0.7}>
              <Ionicons name="ban-outline" size={22} color="#EA0038" />
              <View style={styles.menuTextCol}>
                <Text style={[styles.menuLabel, styles.blockLabel]}>Block business</Text>
              </View>
            </TouchableOpacity>
          </View>
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
    paddingTop: 8,
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
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleCol: { flex: 1, alignItems: "center" },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#14131F" },
  sheetSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#667781", marginTop: 2 },
  menuBlock: { paddingTop: 4 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuTextCol: { flex: 1, minWidth: 0 },
  menuLabel: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#14131F" },
  menuHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#667781", marginTop: 3, lineHeight: 18 },
  blockLabel: { color: "#EA0038" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginLeft: 56,
  },
});
