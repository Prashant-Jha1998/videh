import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import { loadVidehContacts, type VidehContact } from "@/lib/videhContacts";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (userIds: number[]) => Promise<void>;
  excludeUserIds: number[];
  busy?: boolean;
};

export function AddCallParticipantModal({ visible, onClose, onAdd, excludeUserIds, busy }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<VidehContact[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const exclude = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);

  const load = useCallback(async () => {
    if (!user?.phone) return;
    setLoading(true);
    try {
      const list = await loadVidehContacts(getApiUrl(), user.phone, user.sessionToken);
      setContacts(list.filter((c) => !exclude.has(c.videhId)));
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [user?.phone, exclude]);

  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setSearch("");
      void load();
    }
  }, [visible, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.videhName.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      Alert.alert("Add to call", "Select at least one contact.");
      return;
    }
    try {
      await onAdd(ids);
      onClose();
    } catch (e) {
      Alert.alert("Add to call", e instanceof Error ? e.message : "Could not add participants.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={26} color="#E9EDEF" />
          </TouchableOpacity>
          <Text style={styles.title}>Add to call</Text>
          <TouchableOpacity
            onPress={() => void submit()}
            disabled={busy || selected.size === 0}
            style={[styles.addBtn, (busy || selected.size === 0) && styles.addBtnDisabled]}
          >
            <Text style={styles.addBtnText}>{busy ? "Adding…" : "Add"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#8696A0" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Videh contacts"
            placeholderTextColor="#8696A0"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {loading ? (
          <ActivityIndicator color="#5B4FE8" style={{ marginTop: 40 }} />
        ) : Platform.OS === "web" ? (
          <Text style={styles.hint}>Use the mobile app to add people during a call.</Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.hint}>No Videh contacts available to add.</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.videhId)}
            renderItem={({ item }) => {
              const on = selected.has(item.videhId);
              return (
                <TouchableOpacity style={styles.row} onPress={() => toggle(item.videhId)} activeOpacity={0.7}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>
                      {item.videhName.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{item.videhName}</Text>
                    <Text style={styles.sub}>{item.phone}</Text>
                  </View>
                  <Ionicons
                    name={on ? "checkmark-circle" : "ellipse-outline"}
                    size={24}
                    color={on ? "#5B4FE8" : "#8696A0"}
                  />
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12101F" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  title: { flex: 1, color: "#E9EDEF", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  addBtn: {
    backgroundColor: "#5B4FE8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  addBtnDisabled: { opacity: 0.45 },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#1E1D2E",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  searchInput: { flex: 1, color: "#E9EDEF", fontSize: 16, fontFamily: "Inter_400Regular" },
  hint: { color: "#8696A0", textAlign: "center", marginTop: 32, paddingHorizontal: 24, fontFamily: "Inter_400Regular" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#5B4FE8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  rowText: { flex: 1 },
  name: { color: "#E9EDEF", fontSize: 16, fontFamily: "Inter_500Medium" },
  sub: { color: "#8696A0", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
