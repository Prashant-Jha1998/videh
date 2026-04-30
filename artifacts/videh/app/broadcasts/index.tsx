import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
const API_URL = `${getApiUrl()}/api`;

interface BroadcastList {
  id: number;
  name: string;
  recipient_count: number;
  created_at: string;
}

interface Recipient {
  user_id: number;
  name: string;
  phone: string;
  avatar_url?: string;
}

interface Contact {
  id: string | number;
  name: string;
  phone: string;
  avatar_url?: string;
}

export default function BroadcastsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, contacts } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedList, setSelectedList] = useState<BroadcastList | null>(null);
  const [detailModal, setDetailModal] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sendModal, setSendModal] = useState(false);
  const [sendText, setSendText] = useState("");
  const [addContactModal, setAddContactModal] = useState(false);

  const fetchLists = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/broadcasts/user/${user.dbId}`);
      const d = await r.json();
      if (d.success) setLists(d.lists);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const createList = async () => {
    if (!newName.trim() || !user) return;
    try {
      const r = await fetch(`${API_URL}/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: user.dbId, name: newName.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setCreateModal(false);
        setNewName("");
        fetchLists();
      }
    } catch {}
  };

  const openDetail = async (list: BroadcastList) => {
    setSelectedList(list);
    setDetailModal(true);
    try {
      const r = await fetch(`${API_URL}/broadcasts/${list.id}/recipients`);
      const d = await r.json();
      if (d.success) setRecipients(d.recipients);
    } catch {}
  };

  const removeRecipient = async (userId: number) => {
    if (!selectedList) return;
    await fetch(`${API_URL}/broadcasts/${selectedList.id}/recipients/${userId}`, { method: "DELETE" });
    setRecipients((prev) => prev.filter((r) => r.user_id !== userId));
    fetchLists();
  };

  const addContact = async (contact: Contact) => {
    if (!selectedList) return;
    await fetch(`${API_URL}/broadcasts/${selectedList.id}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(contact.id) }),
    });
    const r = await fetch(`${API_URL}/broadcasts/${selectedList.id}/recipients`);
    const d = await r.json();
    if (d.success) setRecipients(d.recipients);
    setAddContactModal(false);
    fetchLists();
  };

  const sendBroadcast = async () => {
    if (!sendText.trim() || !user || !selectedList) return;
    try {
      const r = await fetch(`${API_URL}/broadcasts/${selectedList.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: user.dbId, content: sendText.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        Alert.alert("Bhej diya!", `Message ${d.sentTo} logon ko bheja gaya.`);
        setSendModal(false);
        setSendText("");
        setDetailModal(false);
      } else Alert.alert("Error", d.message);
    } catch (e) {
      Alert.alert("Error", "Network error");
    }
  };

  const deleteList = (list: BroadcastList) => {
    Alert.alert("List Delete Karo?", `"${list.name}" permanently delete hogi.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await fetch(`${API_URL}/broadcasts/${list.id}`, { method: "DELETE" });
          fetchLists();
        }
      }
    ]);
  };

  const availableContacts = contacts.filter(
    (c) => c.id && !recipients.find((r) => r.user_id === Number(c.id))
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Broadcast Lists</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(i) => String(i.id)}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Ionicons name="radio-outline" size={60} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Koi broadcast list nahi</Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              Broadcast se ek saath kai logon ko message bhejo. Sirf Videh users receive karte hain.
            </Text>
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => setCreateModal(true)}>
              <Text style={styles.emptyBtnText}>Nayi List Banao</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.listItem, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
            onPress={() => openDetail(item)}
            onLongPress={() => deleteList(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.listIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="radio-outline" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.listName, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[styles.listSub, { color: colors.mutedForeground }]}>
                {item.recipient_count} {item.recipient_count === 1 ? "recipient" : "recipients"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      />

      {/* Create List Modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreateModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nayi Broadcast List</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
              placeholder="List ka naam..."
              placeholderTextColor={colors.mutedForeground}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setCreateModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={createList}>
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>Banao</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={detailModal} animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
            <TouchableOpacity onPress={() => setDetailModal(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{selectedList?.name}</Text>
            <TouchableOpacity style={styles.headerBtn} onPress={() => { setAddContactModal(true); }}>
              <Ionicons name="person-add-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={recipients}
            keyExtractor={(i) => String(i.user_id)}
            ListHeaderComponent={() => (
              <View style={[styles.sendSection, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setSendModal(true)}
                  disabled={recipients.length === 0}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>Message Broadcast Karo</Text>
                </TouchableOpacity>
                <Text style={[styles.sendHint, { color: colors.mutedForeground }]}>
                  {recipients.length} recipients — sirf Videh users hi receive karenge
                </Text>
              </View>
            )}
            ListEmptyComponent={() => (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Koi recipient nahi</Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>+ icon se contacts add karo</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <View style={[styles.recipientRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.listSub, { color: colors.mutedForeground }]}>+91 {item.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => removeRecipient(item.user_id)} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={22} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* Send Modal */}
      <Modal visible={sendModal} transparent animationType="slide" onRequestClose={() => setSendModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSendModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Broadcast Message</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Yeh message {recipients.length} logon ko alag-alag bheja jaayega
            </Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
              placeholder="Message likhо..."
              placeholderTextColor={colors.mutedForeground}
              value={sendText}
              onChangeText={setSendText}
              multiline
              numberOfLines={4}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.muted }]} onPress={() => setSendModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={sendBroadcast}>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>Bhejo</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Add Contact Modal */}
      <Modal visible={addContactModal} transparent animationType="slide" onRequestClose={() => setAddContactModal(false)}>
        <View style={[styles.fullModal, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
            <TouchableOpacity onPress={() => setAddContactModal(false)} style={styles.backBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Contact Add Karo</Text>
            <View style={{ width: 40 }} />
          </View>
          {availableContacts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                Saare contacts already is list mein hain ya Videh use nahi karte.
              </Text>
            </View>
          ) : (
            <FlatList
              data={availableContacts}
              keyExtractor={(i) => String(i.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.recipientRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
                  onPress={() => addContact(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.listName, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.listSub, { color: colors.mutedForeground }]}>+91 {item.phone}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  headerBtn: { padding: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12, marginTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  listItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 14, borderBottomWidth: 0.5 },
  listIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  listName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  listSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  recipientRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 14, borderBottomWidth: 0.5 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  removeBtn: { padding: 4 },
  sendSection: { padding: 16, borderBottomWidth: 0.5, gap: 8 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, gap: 8 },
  sendBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sendHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, fontFamily: "Inter_400Regular" },
  inputMulti: { height: 100, textAlignVertical: "top" },
  modalBtns: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, gap: 6 },
  modalBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fullModal: { flex: 1 },
});
