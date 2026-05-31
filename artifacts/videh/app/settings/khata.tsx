import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";

export default function KhataPickChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chats } = useApp();

  const sorted = [...chats].sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Khata ledger</Text>
      </View>
      <Text style={styles.sub}>
        Choose a chat to track udhar/credit. Pick Videh members or type any name (shop, family, office) — not everyone needs a Videh account.
      </Text>
      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: "/khata/[chatId]",
                params: {
                  chatId: item.id,
                  name: item.name,
                  manual: "1",
                },
              } as Href)
            }
          >
            <View style={styles.rowIcon}>
              <Ionicons name={item.isGroup ? "people" : "person"} size={20} color="#00A884" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              {item.isGroup ? (
                <Text style={styles.rowMeta}>Group · manual entry</Text>
              ) : (
                <Text style={styles.rowMeta}>1:1 · choose debtor & creditor</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#667781" />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No chats yet. Start a conversation first.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111B21" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#1F2C34",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  sub: { color: "#8696A0", fontSize: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1F2C34",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,168,132,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { color: "#E9EDEF", fontSize: 16, fontWeight: "600" },
  rowMeta: { color: "#8696A0", fontSize: 12, marginTop: 2 },
  empty: { color: "#8696A0", textAlign: "center", marginTop: 40, fontSize: 15 },
});
