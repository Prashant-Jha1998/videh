import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

type KhataNotebook = { id: number; name: string; created_at?: string };

function authHeaders(token?: string | null, extra?: Record<string, string>) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export default function KhataPickChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chats, user, refreshChats } = useApp();

  const [notebooks, setNotebooks] = useState<KhataNotebook[]>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [contactName, setContactName] = useState("");
  const [creating, setCreating] = useState(false);

  const videhChats = useMemo(
    () =>
      [...chats]
        .filter((c) => !c.isKhataNotebook)
        .sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0)),
    [chats],
  );

  const loadNotebooks = useCallback(async () => {
    if (!user?.sessionToken) {
      setLoadingNotebooks(false);
      return;
    }
    setLoadingNotebooks(true);
    try {
      const r = await fetch(`${BASE_URL}/api/khata/notebooks`, {
        headers: authHeaders(user.sessionToken),
      });
      const d = await r.json();
      if (d.success && Array.isArray(d.notebooks)) {
        setNotebooks(d.notebooks);
      }
    } catch {
      /* ignore */
    }
    setLoadingNotebooks(false);
  }, [user?.sessionToken]);

  useEffect(() => {
    void loadNotebooks();
  }, [loadNotebooks]);

  const openKhata = (chatId: string, name: string, isGroup?: boolean) => {
    router.push({
      pathname: "/khata/[chatId]",
      params: {
        chatId,
        name,
        manual: "1",
        ...(isGroup ? { isGroup: "1" } : {}),
      },
    } as Href);
  };

  const createNotebook = async () => {
    const trimmed = contactName.trim();
    if (trimmed.length < 2) {
      Alert.alert("Name required", "Enter the person's or shop's name (at least 2 characters).");
      return;
    }
    if (!user?.dbId || !user.sessionToken) return;
    setCreating(true);
    try {
      const r = await fetch(`${BASE_URL}/api/khata/notebook`, {
        method: "POST",
        headers: authHeaders(user.sessionToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ contactName: trimmed, createdBy: user.dbId }),
      });
      const d = await r.json();
      if (!d.success || !d.chatId) {
        Alert.alert("Could not create khata", d.message ?? "Please try again.");
        return;
      }
      setShowAdd(false);
      setContactName("");
      await refreshChats();
      await loadNotebooks();
      openKhata(String(d.chatId), d.name ?? trimmed, true);
    } catch {
      Alert.alert("Could not create khata", "Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  };

  const sections = useMemo(() => {
    const out: Array<{ title: string; data: Array<{ kind: "notebook" | "chat"; id: string; name: string; isGroup?: boolean }> }> = [];
    if (notebooks.length > 0 || loadingNotebooks) {
      out.push({
        title: "Not on Videh",
        data: notebooks.map((n) => ({ kind: "notebook" as const, id: String(n.id), name: n.name })),
      });
    }
    out.push({
      title: "Videh chats",
      data: videhChats.map((c) => ({
        kind: "chat" as const,
        id: c.id,
        name: c.name,
        isGroup: c.isGroup,
      })),
    });
    return out;
  }, [notebooks, videhChats, loadingNotebooks]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Khata</Text>
        <Pressable onPress={() => setShowAdd(true)} hitSlop={10}>
          <Ionicons name="person-add-outline" size={22} color="#fff" />
        </Pressable>
      </View>

      <Text style={styles.sub}>
        Track credit or debit for shops, family, or anyone — even if they are not on Videh.
      </Text>

      <Pressable style={styles.addCard} onPress={() => setShowAdd(true)}>
        <View style={styles.addIcon}>
          <Ionicons name="book-outline" size={22} color="#059669" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.addTitle}>New ledger (not on Videh)</Text>
          <Text style={styles.addMeta}>Enter a name to create a separate ledger</Text>
        </View>
        <Ionicons name="add-circle" size={26} color="#059669" />
      </Pressable>

      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}_${item.id}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionTitle}>{title}</Text>
        )}
        renderSectionFooter={({ section }) => {
          if (section.title !== "Not on Videh") return null;
          if (loadingNotebooks) {
            return <ActivityIndicator color="#059669" style={{ marginVertical: 16 }} />;
          }
          if (section.data.length === 0) {
            return (
              <Text style={styles.sectionEmpty}>
                No separate ledgers yet. Tap &quot;New ledger&quot; above.
              </Text>
            );
          }
          return null;
        }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => openKhata(item.id, item.name, item.isGroup)}
          >
            <View style={styles.rowIcon}>
              <Ionicons
                name={item.kind === "notebook" ? "book-outline" : item.isGroup ? "people" : "person"}
                size={20}
                color="#059669"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {item.kind === "notebook"
                  ? "Personal ledger · manual entry"
                  : item.isGroup
                    ? "Group · manual entry"
                    : "1:1 · choose debtor & creditor"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#667781" />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No Videh chats yet. Use &quot;New ledger&quot; for people not on Videh.</Text>
        }
      />

      <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAdd(false)} />
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>New ledger</Text>
            <Text style={styles.modalSub}>
              Enter a person or shop name to create their ledger. A Videh account is not required.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Name (e.g. Monty, Kirana shop)"
              placeholderTextColor="#667781"
              value={contactName}
              onChangeText={setContactName}
              autoFocus
              maxLength={80}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowAdd(false)} disabled={creating}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, creating && { opacity: 0.6 }]}
                onPress={() => void createNotebook()}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveText}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#14131F" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#1E1D2E",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", flex: 1 },
  sub: { color: "#8696A0", fontSize: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  addCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(0,168,132,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,168,132,0.35)",
    padding: 14,
  },
  addIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,168,132,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  addTitle: { color: "#E9EDEF", fontSize: 15, fontWeight: "700" },
  addMeta: { color: "#8696A0", fontSize: 12, marginTop: 2 },
  sectionTitle: {
    color: "#059669",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionEmpty: { color: "#667781", fontSize: 13, marginBottom: 8, fontStyle: "italic" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1E1D2E",
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
  empty: { color: "#8696A0", textAlign: "center", marginTop: 40, fontSize: 15, paddingHorizontal: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#1E1D2E",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: { color: "#E9EDEF", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  modalSub: { color: "#8696A0", fontSize: 14, marginBottom: 14, lineHeight: 20 },
  input: {
    backgroundColor: "#14131F",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#E9EDEF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#2A2838",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: "#8696A0", fontSize: 16, fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 88,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
