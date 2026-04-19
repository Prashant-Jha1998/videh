import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

export default function ContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { contacts, chats } = useApp();
  const [search, setSearch] = useState("");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const openChat = (contactId: string, name: string) => {
    const existing = chats.find((ch) => !ch.isGroup && ch.name === name);
    if (existing) {
      router.replace({ pathname: "/chat/[id]", params: { id: existing.id, name } });
    } else {
      router.replace({ pathname: "/chat/[id]", params: { id: `new_${contactId}`, name } });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select contact</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="search-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.search, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
        placeholder="Search contacts"
        placeholderTextColor={colors.mutedForeground}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <TouchableOpacity style={[styles.newGroup, { borderBottomColor: colors.border }]} onPress={() => router.push("/new-group")}>
            <View style={[styles.newGroupIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="people" size={22} color="#fff" />
            </View>
            <Text style={[styles.newGroupText, { color: colors.foreground }]}>New group</Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const initials = item.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
          const hue = item.name.charCodeAt(0) * 37 % 360;
          const avatarBg = `hsl(${hue},50%,45%)`;
          return (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => item.isOnVideh ? openChat(item.id, item.name) : null}
              activeOpacity={item.isOnVideh ? 0.7 : 1}
            >
              <View style={[styles.avatar, { backgroundColor: item.isOnVideh ? avatarBg : colors.muted }]}>
                <Text style={[styles.avatarText, { color: item.isOnVideh ? "#fff" : colors.mutedForeground }]}>{initials}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.phone, { color: colors.mutedForeground }]}>
                  {item.isOnVideh ? "On Videh" : item.phone}
                </Text>
              </View>
              {item.isOnVideh && (
                <TouchableOpacity onPress={() => openChat(item.id, item.name)}>
                  <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 10, gap: 8 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  headerBtn: { padding: 8 },
  search: { marginHorizontal: 12, marginVertical: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  newGroup: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, gap: 14 },
  newGroupIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  newGroupText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  info: { flex: 1 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  phone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
