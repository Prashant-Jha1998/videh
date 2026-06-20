import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export type OwnerVideoMenuAction =
  | "promote"
  | "edit"
  | "save_to_device"
  | "delete"
  | "play_next"
  | "watch_later"
  | "save_playlist"
  | "download"
  | "share"
  | "studio";

type MenuItem = {
  id: OwnerVideoMenuAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  premium?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  { id: "promote", label: "Promote", icon: "megaphone-outline" },
  { id: "edit", label: "Edit", icon: "create-outline" },
  { id: "save_to_device", label: "Save to device", icon: "phone-portrait-outline" },
  { id: "delete", label: "Delete", icon: "trash-outline", danger: true },
  { id: "play_next", label: "Play next in queue", icon: "list-outline", premium: true },
  { id: "watch_later", label: "Save to Watch Later", icon: "time-outline" },
  { id: "save_playlist", label: "Save to playlist", icon: "bookmark-outline" },
  { id: "download", label: "Download video", icon: "download-outline" },
  { id: "share", label: "Share", icon: "share-social-outline" },
  { id: "studio", label: "Edit advanced settings in Studio", icon: "logo-youtube" },
];

type Props = {
  visible: boolean;
  videoTitle?: string;
  onClose: () => void;
  onAction: (action: OwnerVideoMenuAction) => void;
};

export function ReelsOwnerVideoMenu({ visible, videoTitle, onClose, onAction }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 12,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {videoTitle ? (
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {videoTitle}
            </Text>
          ) : null}
          <ScrollView bounces={false} style={styles.list}>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.row, { borderBottomColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  setTimeout(() => onAction(item.id), 80);
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={item.danger ? "#e53935" : colors.foreground}
                  style={styles.rowIcon}
                />
                <Text
                  style={[
                    styles.rowLabel,
                    { color: item.danger ? "#e53935" : colors.foreground },
                  ]}
                >
                  {item.label}
                </Text>
                {item.premium ? (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumText}>P</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "78%",
    paddingTop: 12,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 28,
    marginRight: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  premiumBadge: {
    backgroundColor: "#e53935",
    borderRadius: 3,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
});
