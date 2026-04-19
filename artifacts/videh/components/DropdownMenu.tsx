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

export interface DropdownItem {
  label: string;
  icon?: string;
  danger?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  items: DropdownItem[];
  topOffset?: number;
}

export function DropdownMenu({ visible, onClose, items, topOffset = 54 }: Props) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View
          style={[
            styles.menu,
            { top: topOffset + (Platform.OS === "web" ? 67 : 0) },
          ]}
        >
          {items.map((item, idx) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.item, idx < items.length - 1 && styles.itemBorder]}
              onPress={() => { onClose(); setTimeout(item.onPress, 100); }}
              activeOpacity={0.7}
            >
              {item.icon && (
                <Ionicons
                  name={item.icon as any}
                  size={17}
                  color={item.danger ? "#ef4444" : "#374151"}
                  style={styles.itemIcon}
                />
              )}
              <Text style={[styles.itemText, item.danger && styles.dangerText]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  menu: {
    position: "absolute",
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    minWidth: 200,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  itemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  itemIcon: {},
  itemText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#1f2937",
  },
  dangerText: { color: "#ef4444" },
});
