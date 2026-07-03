import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { normalizePhone } from "@/lib/videhContacts";

const API_URL = `${getApiUrl()}/api`;

type Screen = "lists" | "pick" | "detail";

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

interface ContactCandidate {
  id: number;
  name: string;
  phone: string;
  avatarUrl?: string;
}

function authHeaders(token?: string) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function broadcastListName(contacts: ContactCandidate[]): string {
  if (contacts.length === 0) return "Broadcast list";
  const names = contacts.map((c) => c.name.split(" ")[0] || c.name);
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

function avatarHue(name: string): number {
  return (name.charCodeAt(0) || 65) * 37 % 360;
}

export default function BroadcastsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { listId: listIdParam } = useLocalSearchParams<{ listId?: string }>();
  const { user, chats } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom;

  const [screen, setScreen] = useState<Screen>("lists");
  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedList, setSelectedList] = useState<BroadcastList | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);

  const [candidates, setCandidates] = useState<ContactCandidate[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [pickedIds, setPickedIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchLists = useCallback(async () => {
    if (!user?.dbId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/broadcasts/user/${user.dbId}`, {
        headers: authHeaders(user.sessionToken),
      });
      const d = await r.json();
      if (d.success) setLists(d.lists);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { void fetchLists(); }, [fetchLists]);

  const loadCandidates = useCallback(async () => {
    if (!user) return;
    setContactsLoading(true);
    try {
      if (Platform.OS === "web") {
        const { chatsToWebMembers } = await import("@/lib/web/webContacts");
        const rows = chatsToWebMembers(chats, user.dbId).map((m) => ({
          id: m.id,
          name: m.name,
          phone: m.phone ?? "",
          avatarUrl: m.avatarUrl,
        }));
        setCandidates(rows);
        return;
      }
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        setCandidates([]);
        return;
      }
      const contactResp = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      const phones = new Set<string>();
      for (const c of contactResp.data) {
        if (!c.phoneNumbers?.length) continue;
        for (const pn of c.phoneNumbers) {
          const normalized = normalizePhone(pn.number ?? "");
          if (normalized.length >= 10) phones.add(normalized);
        }
      }
      if (phones.size === 0) {
        setCandidates([]);
        return;
      }
      const res = await fetch(`${API_URL}/users/check-phones`, {
        method: "POST",
        headers: jsonAuthHeaders(user.sessionToken),
        body: JSON.stringify({ phones: Array.from(phones) }),
      });
      const data = (await res.json()) as { registered?: Record<string, { id: number; name?: string; avatarUrl?: string; phone?: string }> };
      const registered = data.registered ?? {};
      const rows = Object.values(registered)
        .filter((u) => Number(u.id) !== user.dbId)
        .map((u) => ({
          id: Number(u.id),
          name: u.name ?? u.phone ?? "Contact",
          phone: u.phone ?? "",
          avatarUrl: u.avatarUrl,
        })) as ContactCandidate[];
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setCandidates(rows);
    } catch {
      setCandidates([]);
    } finally {
      setContactsLoading(false);
    }
  }, [chats, user]);

  const fetchRecipients = useCallback(async (list: BroadcastList) => {
    if (!user) return;
    try {
      const r = await fetch(`${API_URL}/broadcasts/${list.id}/recipients`, {
        headers: authHeaders(user.sessionToken),
      });
      const d = await r.json();
      if (d.success) setRecipients(d.recipients);
    } catch {}
  }, [user]);

  const openDetail = useCallback(async (list: BroadcastList) => {
    setSelectedList(list);
    setScreen("detail");
    setSendText("");
    await fetchRecipients(list);
  }, [fetchRecipients]);

  useEffect(() => {
    if (!listIdParam || lists.length === 0) return;
    const match = lists.find((l) => String(l.id) === String(listIdParam));
    if (match) void openDetail(match);
  }, [listIdParam, lists, openDetail]);

  const startCreate = () => {
    setSelectedList(null);
    setPickedIds([]);
    setContactSearch("");
    setScreen("pick");
    void loadCandidates();
  };

  const startAddRecipients = () => {
    setPickedIds([]);
    setContactSearch("");
    setScreen("pick");
    void loadCandidates();
  };

  const togglePick = (id: number) => {
    setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createListWithPicks = async () => {
    if (!user || pickedIds.length < 2) {
      Alert.alert("Select recipients", "Choose at least 2 contacts for a broadcast list.");
      return;
    }
    const picked = candidates.filter((c) => pickedIds.includes(c.id));
    setCreating(true);
    try {
      const r = await fetch(`${API_URL}/broadcasts`, {
        method: "POST",
        headers: authHeaders(user.sessionToken),
        body: JSON.stringify({ name: broadcastListName(picked) }),
      });
      const d = await r.json();
      if (!d.success) {
        Alert.alert("Error", d.message ?? "Could not create list");
        return;
      }
      const list = d.list as BroadcastList;
      for (const c of picked) {
        await fetch(`${API_URL}/broadcasts/${list.id}/recipients`, {
          method: "POST",
          headers: authHeaders(user.sessionToken),
          body: JSON.stringify({ userId: c.id }),
        });
      }
      await fetchLists();
      setScreen("lists");
      await openDetail({ ...list, recipient_count: picked.length });
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setCreating(false);
    }
  };

  const addPickedToList = async () => {
    if (!user || !selectedList || pickedIds.length === 0) return;
    setCreating(true);
    try {
      for (const id of pickedIds) {
        await fetch(`${API_URL}/broadcasts/${selectedList.id}/recipients`, {
          method: "POST",
          headers: authHeaders(user.sessionToken),
          body: JSON.stringify({ userId: id }),
        });
      }
      await fetchRecipients(selectedList);
      await fetchLists();
      setScreen("detail");
    } catch {
      Alert.alert("Error", "Could not add contacts");
    } finally {
      setCreating(false);
    }
  };

  const removeRecipient = async (userId: number) => {
    if (!selectedList || !user) return;
    await fetch(`${API_URL}/broadcasts/${selectedList.id}/recipients/${userId}`, {
      method: "DELETE",
      headers: authHeaders(user.sessionToken),
    });
    setRecipients((prev) => prev.filter((r) => r.user_id !== userId));
    void fetchLists();
  };

  const sendBroadcast = async () => {
    if (!sendText.trim() || !user || !selectedList) return;
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/broadcasts/${selectedList.id}/send`, {
        method: "POST",
        headers: authHeaders(user.sessionToken),
        body: JSON.stringify({ content: sendText.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setSendText("");
        Alert.alert("Sent", `Delivered to ${d.sentTo} ${d.sentTo === 1 ? "person" : "people"}.`);
      } else Alert.alert("Error", d.message ?? "Could not send");
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setSending(false);
    }
  };

  const deleteList = (list: BroadcastList) => {
    Alert.alert("Delete broadcast list?", `"${list.name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!user) return;
          await fetch(`${API_URL}/broadcasts/${list.id}`, {
            method: "DELETE",
            headers: authHeaders(user.sessionToken),
          });
          if (selectedList?.id === list.id) {
            setSelectedList(null);
            setScreen("lists");
          }
          void fetchLists();
        },
      },
    ]);
  };

  const filteredCandidates = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const existing = new Set(recipients.map((r) => r.user_id));
    const pool = screen === "pick" && selectedList
      ? candidates.filter((c) => !existing.has(c.id))
      : candidates;
    if (!q) return pool;
    return pool.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [candidates, contactSearch, recipients, screen, selectedList]);

  const goBack = () => {
    if (screen === "pick") {
      setScreen(selectedList ? "detail" : "lists");
      return;
    }
    if (screen === "detail") {
      setScreen("lists");
      setSelectedList(null);
      return;
    }
    router.back();
  };

  const renderListRow = ({ item }: { item: BroadcastList }) => (
    <TouchableOpacity
      style={[styles.listRow, { borderBottomColor: colors.border }]}
      onPress={() => void openDetail(item)}
      onLongPress={() => deleteList(item)}
      activeOpacity={0.65}
    >
      <View style={styles.broadcastIcon}>
        <Ionicons name="megaphone" size={22} color="#fff" />
      </View>
      <View style={styles.listRowBody}>
        <Text style={[styles.listRowName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.listRowSub, { color: colors.mutedForeground }]}>
          {item.recipient_count} {item.recipient_count === 1 ? "recipient" : "recipients"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderContactRow = ({ item }: { item: ContactCandidate }) => {
    const isSelected = pickedIds.includes(item.id);
    const initials = item.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    return (
      <TouchableOpacity
        style={[styles.contactRow, { borderBottomColor: colors.border }]}
        onPress={() => togglePick(item.id)}
        activeOpacity={0.65}
      >
        <View style={[styles.contactAvatar, { backgroundColor: `hsl(${avatarHue(item.name)},48%,42%)` }]}>
          <Text style={styles.contactAvatarText}>{initials}</Text>
        </View>
        <View style={styles.contactBody}>
          <Text style={[styles.contactName, { color: colors.foreground }]}>{item.name}</Text>
          {item.phone ? (
            <Text style={[styles.contactPhone, { color: colors.mutedForeground }]}>{item.phone}</Text>
          ) : null}
        </View>
        <View style={[styles.checkCircle, isSelected && styles.checkCircleOn]}>
          {isSelected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderRecipientRow = ({ item }: { item: Recipient }) => {
    const initials = item.name.charAt(0).toUpperCase();
    return (
      <View style={[styles.contactRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.contactAvatar, { backgroundColor: `hsl(${avatarHue(item.name)},48%,42%)` }]}>
          <Text style={styles.contactAvatarText}>{initials}</Text>
        </View>
        <View style={styles.contactBody}>
          <Text style={[styles.contactName, { color: colors.foreground }]}>{item.name}</Text>
          <Text style={[styles.contactPhone, { color: colors.mutedForeground }]}>{item.phone}</Text>
        </View>
        <TouchableOpacity onPress={() => removeRecipient(item.user_id)} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    );
  };

  if (screen === "pick") {
    const isAdding = Boolean(selectedList);
    const canConfirm = isAdding ? pickedIds.length >= 1 : pickedIds.length >= 2;
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
          <TouchableOpacity onPress={goBack} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.headerIconColor} />
          </TouchableOpacity>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>{isAdding ? "Add recipients" : "New broadcast"}</Text>
            <Text style={styles.headerSub}>
              {pickedIds.length} of {filteredCandidates.length} selected
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerBtn, !canConfirm && { opacity: 0.35 }]}
            disabled={!canConfirm || creating}
            onPress={() => void (isAdding ? addPickedToList() : createListWithPicks())}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="checkmark" size={26} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {pickedIds.length > 0 ? (
          <View style={[styles.chipBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {pickedIds.map((id) => {
              const c = candidates.find((x) => x.id === id);
              if (!c) return null;
              return (
                <TouchableOpacity key={id} style={styles.chip} onPress={() => togglePick(id)}>
                  <Text style={styles.chipText}>{c.name.split(" ")[0]}</Text>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search name or number"
            placeholderTextColor={colors.mutedForeground}
            value={contactSearch}
            onChangeText={setContactSearch}
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={colors.primary}
          />
          {contactSearch.length > 0 ? (
            <TouchableOpacity onPress={() => setContactSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        {contactsLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>Loading contacts on Videh…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredCandidates}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderContactRow}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  No Videh contacts found. Ask friends to join Videh, then try again.
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  if (screen === "detail" && selectedList) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? topPad : 0}
      >
        <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
          <TouchableOpacity onPress={goBack} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.headerIconColor} />
          </TouchableOpacity>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle} numberOfLines={1}>{selectedList.name}</Text>
            <Text style={styles.headerSub}>
              {recipients.length} {recipients.length === 1 ? "recipient" : "recipients"}
            </Text>
          </View>
          <TouchableOpacity style={styles.headerBtn} onPress={startAddRecipients}>
            <Ionicons name="person-add-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={recipients}
          keyExtractor={(i) => String(i.user_id)}
          renderItem={renderRecipientRow}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={[styles.sectionHead, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionHeadText, { color: colors.mutedForeground }]}>
                ONLY CONTACTS WITH YOUR NUMBER IN THEIR ADDRESS BOOK WILL RECEIVE BROADCAST MESSAGES
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                No recipients yet. Tap + to add contacts.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 8 }}
        />

        <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad + 8 }]}>
          <TextInput
            style={[styles.composerInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            placeholder="Type a message"
            placeholderTextColor={colors.mutedForeground}
            value={sendText}
            onChangeText={setSendText}
            multiline
            maxLength={4096}
            selectionColor={colors.primary}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!sendText.trim() || recipients.length === 0 || sending) && { opacity: 0.45 }]}
            onPress={() => void sendBroadcast()}
            disabled={!sendText.trim() || recipients.length === 0 || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.headerIconColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, styles.headerTitleCenter]}>Broadcast lists</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={startCreate}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.infoBanner, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.infoBannerText, { color: colors.mutedForeground }]}>
          Create a list of contacts to send messages to many people at once. Each person receives it in their individual chat with you.
        </Text>
      </View>

      <FlatList
        data={lists}
        keyExtractor={(i) => String(i.id)}
        refreshing={loading}
        onRefresh={fetchLists}
        renderItem={renderListRow}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyLists}>
              <Text style={[styles.emptyListsText, { color: colors.mutedForeground }]}>
                Tap + to create your first broadcast list
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 4,
    paddingBottom: 10,
    gap: 4,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTextCol: { flex: 1, paddingBottom: 2 },
  headerTitle: { color: "#fff", fontSize: 19, fontFamily: "Inter_600SemiBold" },
  headerTitleCenter: { flex: 1, textAlign: "center", paddingBottom: 8 },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  infoBanner: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  infoBannerText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  broadcastIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  listRowBody: { flex: 1 },
  listRowName: { fontSize: 17, fontFamily: "Inter_500Medium" },
  listRowSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyLists: { padding: 32, alignItems: "center" },
  emptyListsText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  chipBar: { flexDirection: "row", flexWrap: "wrap", padding: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#059669",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: Platform.OS === "android" ? 4 : 0 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  contactAvatarText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  contactBody: { flex: 1 },
  contactName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  contactPhone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#8696A0",
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleOn: { backgroundColor: "#059669", borderColor: "#059669" },
  centerBox: { alignItems: "center", justifyContent: "center", padding: 40, gap: 12, marginTop: 40 },
  hintText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  sectionHead: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHeadText: { fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 0.3, lineHeight: 16 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlignVertical: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
});
