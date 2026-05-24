import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

type ChatMember = { id: number; name: string; avatar_url?: string | null };

type KhataEntry = {
  id: number;
  debtor_name: string;
  debtor_user_id: number | null;
  debtor_user_name: string | null;
  creditor_user_id: number | null;
  creditor_name: string | null;
  creditor_user_name: string | null;
  amount: string;
  note: string | null;
  paid: boolean;
  paid_at: string | null;
  paid_by_name: string | null;
  created_at: string;
  creator_name: string;
};

type MemberBalance = {
  userId: number;
  name: string;
  owes: number;
  owed: number;
  net: number;
};

type PairwiseBalance = {
  fromUserId: number;
  fromName: string;
  toUserId: number;
  toName: string;
  amount: number;
};

function authHeaders(token?: string | null, extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function KhataScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [entries, setEntries] = useState<KhataEntry[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [memberBalances, setMemberBalances] = useState<MemberBalance[]>([]);
  const [pairwise, setPairwise] = useState<PairwiseBalance[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [debtorUserId, setDebtorUserId] = useState<number | null>(null);
  const [creditorUserId, setCreditorUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("pending");
  const [screenTab, setScreenTab] = useState<"entries" | "balances">("entries");

  const selfId = user?.dbId ?? null;

  const loadMembers = useCallback(async () => {
    if (!chatId || !user?.sessionToken) return;
    try {
      const r = await fetch(`${BASE_URL}/api/chats/${chatId}/members`, {
        headers: authHeaders(user.sessionToken),
      });
      const d = await r.json();
      if (d.success && Array.isArray(d.members)) {
        setMembers(d.members.map((m: { id: number; name: string; avatar_url?: string }) => ({
          id: Number(m.id),
          name: m.name,
          avatar_url: m.avatar_url,
        })));
      }
    } catch {
      /* ignore */
    }
  }, [chatId, user?.sessionToken]);

  const load = useCallback(async () => {
    if (!chatId || !user?.sessionToken) return;
    setLoading(true);
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        fetch(`${BASE_URL}/api/khata/chat/${chatId}`, { headers: authHeaders(user.sessionToken) }),
        fetch(`${BASE_URL}/api/khata/chat/${chatId}/summary`, { headers: authHeaders(user.sessionToken) }),
      ]);
      const entriesData = await entriesRes.json();
      const summaryData = await summaryRes.json();
      if (entriesData.success) setEntries(entriesData.entries);
      else Alert.alert("Could not load ledger", entriesData.message ?? "Please try again.");
      if (summaryData.success) {
        setMemberBalances(summaryData.memberBalances ?? []);
        setPairwise(summaryData.pairwise ?? []);
        setTotalPending(Number(summaryData.totalPending ?? 0));
      }
    } catch {
      Alert.alert("Could not load ledger", "Please check your connection and try again.");
    }
    setLoading(false);
  }, [chatId, user?.sessionToken]);

  useEffect(() => {
    void loadMembers();
    void load();
  }, [loadMembers, load]);

  useEffect(() => {
    if (selfId && creditorUserId == null) setCreditorUserId(selfId);
  }, [selfId, creditorUserId]);

  const debtorLabel = useMemo(() => {
    if (!debtorUserId) return "Select member";
    return members.find((m) => m.id === debtorUserId)?.name ?? "Member";
  }, [debtorUserId, members]);

  const creditorLabel = useMemo(() => {
    if (!creditorUserId) return "Select member";
    return members.find((m) => m.id === creditorUserId)?.name ?? "Member";
  }, [creditorUserId, members]);

  const addEntry = async () => {
    const parsedAmount = Number(amount);
    if (!debtorUserId || !creditorUserId || !amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Incomplete", "Select who owes, who lent, and enter a valid amount.");
      return;
    }
    if (debtorUserId === creditorUserId) {
      Alert.alert("Invalid", "Debtor and creditor must be different people.");
      return;
    }
    if (!user?.dbId || !user.sessionToken) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/khata`, {
        method: "POST",
        headers: authHeaders(user.sessionToken),
        body: JSON.stringify({
          chatId: Number(chatId),
          createdBy: user.dbId,
          debtorUserId,
          creditorUserId,
          amount: parsedAmount,
          note: note.trim() || null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        setDebtorUserId(null);
        setCreditorUserId(selfId);
        setAmount("");
        setNote("");
        await load();
      } else Alert.alert("Could not save entry", d.message ?? "Please try again.");
    } catch {
      Alert.alert("Could not save entry", "Please check your connection and try again.");
    }
    setSaving(false);
  };

  const markPaid = (entry: KhataEntry) => {
    const debtor = entry.debtor_user_name ?? entry.debtor_name;
    const creditor = entry.creditor_user_name ?? entry.creditor_name ?? "Member";
    Alert.alert(
      "Mark as Paid?",
      `${debtor}'s ₹${Number(entry.amount).toFixed(2)} to ${creditor} will be marked paid.`,
      [
        {
          text: "Mark paid",
          onPress: async () => {
            if (!user?.dbId || !user.sessionToken) return;
            const r = await fetch(`${BASE_URL}/api/khata/${entry.id}/pay`, {
              method: "PUT",
              headers: authHeaders(user.sessionToken),
              body: JSON.stringify({ paidBy: user.dbId }),
            });
            if (!r.ok) {
              const d = await r.json().catch(() => ({}));
              Alert.alert("Could not mark as paid", d.message ?? "Please try again.");
              return;
            }
            await load();
          },
        },
        { text: "Cancel" },
      ],
    );
  };

  const deleteEntry = (id: number) => {
    Alert.alert("Delete?", "This entry will be deleted.", [
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!user?.sessionToken) return;
          const r = await fetch(`${BASE_URL}/api/khata/${id}`, {
            method: "DELETE",
            headers: authHeaders(user.sessionToken),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            Alert.alert("Could not delete entry", d.message ?? "Please try again.");
            return;
          }
          await load();
        },
      },
      { text: "Cancel" },
    ]);
  };

  const sharePdf = async () => {
    if (!chatId || !user?.sessionToken || sharingPdf) return;
    setSharingPdf(true);
    try {
      const month = monthKey();
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      if (!cacheDir) throw new Error("No cache directory");
      const path = `${cacheDir}khata_${chatId}_${month}.pdf`;
      const url = `${BASE_URL}/api/khata/chat/${chatId}/pdf?month=${month}`;
      const res = await FileSystem.downloadAsync(path, url, {
        headers: { Authorization: `Bearer ${user.sessionToken}` },
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("PDF ready", `Saved to ${res.uri}`);
        return;
      }
      await Sharing.shareAsync(res.uri, { mimeType: "application/pdf", dialogTitle: "Share Khata PDF" });
    } catch {
      Alert.alert("Could not export PDF", "Please try again.");
    } finally {
      setSharingPdf(false);
    }
  };

  const filtered = entries.filter((e) =>
    filter === "all" ? true : filter === "pending" ? !e.paid : e.paid,
  );

  const renderMemberChip = (
    member: ChatMember,
    selected: boolean,
    onSelect: () => void,
    disabled?: boolean,
  ) => (
    <Pressable
      key={member.id}
      onPress={onSelect}
      disabled={disabled}
      style={[styles.memberChip, selected && styles.memberChipActive, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.memberChipText, selected && styles.memberChipTextActive]} numberOfLines={1}>
        {member.name}{member.id === selfId ? " (You)" : ""}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Khata</Text>
          {name ? <Text style={styles.headerSub}>{name}</Text> : null}
        </View>
        <Pressable onPress={() => void sharePdf()} style={styles.iconBtn} disabled={sharingPdf}>
          {sharingPdf ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="document-text-outline" size={24} color="#fff" />}
        </Pressable>
        <Pressable onPress={() => setShowAdd(true)} style={styles.iconBtn}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {totalPending > 0 && (
        <View style={styles.summaryBar}>
          <Ionicons name="alert-circle" size={16} color="#F0C040" />
          <Text style={styles.summaryText}> Total pending: ₹{totalPending.toFixed(2)}</Text>
        </View>
      )}

      <View style={styles.tabs}>
        {(["entries", "balances"] as const).map((t) => (
          <Pressable key={t} onPress={() => setScreenTab(t)} style={[styles.tab, screenTab === t && styles.tabActive]}>
            <Text style={[styles.tabTxt, screenTab === t && styles.tabTxtActive]}>
              {t === "entries" ? "Entries" : "Balances"}
            </Text>
          </Pressable>
        ))}
      </View>

      {screenTab === "entries" && (
        <View style={styles.subTabs}>
          {(["pending", "all", "paid"] as const).map((t) => (
            <Pressable key={t} onPress={() => setFilter(t)} style={[styles.subTab, filter === t && styles.subTabActive]}>
              <Text style={[styles.subTabTxt, filter === t && styles.subTabTxtActive]}>
                {t === "pending" ? "Pending" : t === "paid" ? "Paid" : "All"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#00A884" style={{ marginTop: 40 }} />
      ) : screenTab === "balances" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {pairwise.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Who owes whom</Text>
              {pairwise.map((p) => (
                <View key={`${p.fromUserId}-${p.toUserId}`} style={styles.balanceCard}>
                  <Text style={styles.balanceMain}>
                    {p.fromName} → {p.toName}
                  </Text>
                  <Text style={styles.balanceAmt}>₹{p.amount.toFixed(2)}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text style={styles.sectionTitle}>Net balance</Text>
          {memberBalances.length === 0 ? (
            <Text style={styles.emptySub}>No pending balances.</Text>
          ) : (
            memberBalances.map((m) => (
              <View key={m.userId} style={styles.balanceCard}>
                <Text style={styles.balanceMain}>{m.name}{m.userId === selfId ? " (You)" : ""}</Text>
                <Text style={[styles.balanceAmt, m.net >= 0 ? styles.positive : styles.negative]}>
                  {m.net >= 0 ? `Receives ₹${m.net.toFixed(2)}` : `Owes ₹${Math.abs(m.net).toFixed(2)}`}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{filter === "pending" ? "No pending entries." : "No entries found."}</Text>
          <Text style={styles.emptySub}>Tap + to add Khata entry</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const debtor = item.debtor_user_name ?? item.debtor_name;
            const creditor = item.creditor_user_name ?? item.creditor_name ?? "Member";
            return (
              <View style={[styles.card, item.paid && styles.cardPaid]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={styles.debtorName}>{debtor}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#8696A0" />
                    <Text style={styles.creditorName}>{creditor}</Text>
                    {item.paid && (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeTxt}>✓ Paid</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.amountText}>₹{Number(item.amount).toFixed(2)}</Text>
                  {item.note ? <Text style={styles.noteText}>{item.note}</Text> : null}
                  <Text style={styles.metaText}>
                    By {item.creator_name} • {new Date(item.created_at).toLocaleDateString("en-IN")}
                    {item.paid && item.paid_by_name ? ` • Paid by ${item.paid_by_name}` : ""}
                  </Text>
                </View>
                <View style={{ gap: 8 }}>
                  {!item.paid && (
                    <Pressable onPress={() => markPaid(item)} style={styles.payBtn}>
                      <Ionicons name="checkmark-circle" size={28} color="#00A884" />
                    </Pressable>
                  )}
                  <Pressable onPress={() => deleteEntry(item.id)}>
                    <Ionicons name="trash-outline" size={22} color="#E74C3C" />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoider} pointerEvents="box-none">
            <ScrollView style={[styles.modal, { paddingBottom: insets.bottom + 16 }]} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Add Khata Entry</Text>

              <Text style={styles.label}>Who owes (debtor)</Text>
              <View style={styles.chipRow}>
                {members.filter((m) => m.id !== creditorUserId).map((m) =>
                  renderMemberChip(m, debtorUserId === m.id, () => setDebtorUserId(m.id)),
                )}
              </View>
              <Text style={styles.pickerHint}>Selected: {debtorLabel}</Text>

              <Text style={styles.label}>Who lent (creditor)</Text>
              <View style={styles.chipRow}>
                {members.filter((m) => m.id !== debtorUserId).map((m) =>
                  renderMemberChip(m, creditorUserId === m.id, () => setCreditorUserId(m.id)),
                )}
              </View>
              <Text style={styles.pickerHint}>Selected: {creditorLabel}</Text>

              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 500"
                placeholderTextColor="#666"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. dinner, petrol, rent..."
                placeholderTextColor="#666"
                value={note}
                onChangeText={setNote}
              />

              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void addEntry()} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Save entry</Text>}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111B21" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#1F2C34", paddingHorizontal: 12, paddingVertical: 14 },
  backBtn: { marginRight: 12 },
  iconBtn: { padding: 4, marginLeft: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  headerSub: { color: "#8696A0", fontSize: 13 },
  summaryBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#2A3942", paddingHorizontal: 16, paddingVertical: 10 },
  summaryText: { color: "#F0C040", fontSize: 14, fontWeight: "600" },
  tabs: { flexDirection: "row", backgroundColor: "#1F2C34", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: "center", backgroundColor: "#2A3942" },
  tabActive: { backgroundColor: "#00A884" },
  tabTxt: { color: "#8696A0", fontSize: 14, fontWeight: "600" },
  tabTxtActive: { color: "#fff" },
  subTabs: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  subTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#2A3942" },
  subTabActive: { backgroundColor: "#00A88430" },
  subTabTxt: { color: "#8696A0", fontSize: 13, fontWeight: "600" },
  subTabTxtActive: { color: "#00A884" },
  sectionTitle: { color: "#E9EEF0", fontSize: 15, fontWeight: "700", marginTop: 4 },
  balanceCard: { backgroundColor: "#1F2C34", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceMain: { color: "#E9EEF0", fontSize: 15, fontWeight: "600", flex: 1, marginRight: 8 },
  balanceAmt: { color: "#00A884", fontSize: 16, fontWeight: "800" },
  positive: { color: "#00A884" },
  negative: { color: "#F0C040" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: "#E9EEF0", fontSize: 18, fontWeight: "600" },
  emptySub: { color: "#8696A0", fontSize: 14 },
  card: { backgroundColor: "#1F2C34", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "flex-start" },
  cardPaid: { opacity: 0.65 },
  debtorName: { color: "#E9EEF0", fontSize: 15, fontWeight: "700" },
  creditorName: { color: "#8696A0", fontSize: 15, fontWeight: "600" },
  amountText: { color: "#00A884", fontSize: 20, fontWeight: "800", marginVertical: 4 },
  noteText: { color: "#8696A0", fontSize: 14, marginBottom: 4 },
  metaText: { color: "#555E65", fontSize: 12 },
  paidBadge: { backgroundColor: "#00A88420", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  paidBadgeTxt: { color: "#00A884", fontSize: 12, fontWeight: "600" },
  payBtn: {},
  modalRoot: { flex: 1 },
  keyboardAvoider: { flex: 1, justifyContent: "flex-end" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: "#1F2C34", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, width: "100%", maxHeight: "88%" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { color: "#8696A0", fontSize: 13, marginBottom: 6, marginTop: 12 },
  pickerHint: { color: "#667781", fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  memberChip: { backgroundColor: "#2A3942", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  memberChipActive: { backgroundColor: "#00A884" },
  memberChipText: { color: "#8696A0", fontSize: 13, fontWeight: "600", maxWidth: 140 },
  memberChipTextActive: { color: "#fff" },
  input: { backgroundColor: "#2A3942", color: "#E9EEF0", borderRadius: 10, padding: 12, fontSize: 15 },
  saveBtn: { backgroundColor: "#00A884", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
