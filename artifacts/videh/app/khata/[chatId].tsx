import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type KhataEntry = {
  id: number;
  debtor_name: string;
  amount: string;
  note: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
  creator_name: string;
};

export default function KhataScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [entries, setEntries] = useState<KhataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [debtorName, setDebtorName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("pending");

  const load = useCallback(async () => {
    if (!chatId) return;
    try {
      const r = await fetch(`${BASE_URL}/api/khata/chat/${chatId}`);
      const d = await r.json();
      if (d.success) setEntries(d.entries);
    } catch {}
    setLoading(false);
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const addEntry = async () => {
    if (!debtorName.trim() || !amount.trim() || isNaN(parseFloat(amount))) {
      Alert.alert("Incomplete", "Naam aur amount dono chahiye.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/khata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: Number(chatId),
          createdBy: user?.dbId,
          debtorName: debtorName.trim(),
          amount: parseFloat(amount),
          note: note.trim() || null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        setDebtorName(""); setAmount(""); setNote("");
        load();
      } else Alert.alert("Error", d.message);
    } catch { Alert.alert("Error", "Network error"); }
    setSaving(false);
  };

  const markPaid = (entry: KhataEntry) => {
    Alert.alert(
      "Mark as Paid?",
      `${entry.debtor_name} ka ₹${Number(entry.amount).toFixed(2)} paid mark ho jayega aur group mein notification jayegi.`,
      [
        { text: "Haan, paid!", onPress: async () => {
          await fetch(`${BASE_URL}/api/khata/${entry.id}/pay`, { method: "PUT" });
          load();
        }},
        { text: "Nahi" },
      ]
    );
  };

  const deleteEntry = (id: number) => {
    Alert.alert("Delete?", "Yeh entry delete ho jayegi.", [
      { text: "Delete", style: "destructive", onPress: async () => {
        await fetch(`${BASE_URL}/api/khata/${id}`, { method: "DELETE" });
        load();
      }},
      { text: "Cancel" },
    ]);
  };

  const filtered = entries.filter(e =>
    filter === "all" ? true : filter === "pending" ? !e.paid : e.paid
  );

  const totalPending = entries
    .filter(e => !e.paid)
    .reduce((s, e) => s + parseFloat(e.amount), 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>💰 Khata / Udhar</Text>
          {name ? <Text style={styles.headerSub}>{name}</Text> : null}
        </View>
        <Pressable onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {/* Summary bar */}
      {totalPending > 0 && (
        <View style={styles.summaryBar}>
          <Ionicons name="alert-circle" size={16} color="#F0C040" />
          <Text style={styles.summaryText}> Total pending: ₹{totalPending.toFixed(2)}</Text>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(["pending", "all", "paid"] as const).map((t) => (
          <Pressable key={t} onPress={() => setFilter(t)} style={[styles.tab, filter === t && styles.tabActive]}>
            <Text style={[styles.tabTxt, filter === t && styles.tabTxtActive]}>
              {t === "pending" ? "Baaki" : t === "paid" ? "Paid" : "Sab"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#00A884" style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {filter === "pending" ? "Sab clear hai! 🎉" : "Koi entry nahi."}
          </Text>
          <Text style={styles.emptySub}>+ button dabakar entry add karo</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={[styles.card, item.paid && styles.cardPaid]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.debtorName}>{item.debtor_name}</Text>
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
          )}
        />
      )}

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modal, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>💰 Khata Entry Add Karo</Text>

            <Text style={styles.label}>Kisne lena hai (naam)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Rahul, Priya, Sharma ji..."
              placeholderTextColor="#666"
              value={debtorName}
              onChangeText={setDebtorName}
            />

            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500"
              placeholderTextColor="#666"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Dhaba ka bill, petrol, etc."
              placeholderTextColor="#666"
              value={note}
              onChangeText={setNote}
            />

            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={addEntry} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.saveBtnTxt}>Save Karo</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111B21" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#1F2C34", paddingHorizontal: 12, paddingVertical: 14 },
  backBtn: { marginRight: 12 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  headerSub: { color: "#8696A0", fontSize: 13 },
  addBtn: { padding: 4 },
  summaryBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#2A3942", paddingHorizontal: 16, paddingVertical: 10 },
  summaryText: { color: "#F0C040", fontSize: 14, fontWeight: "600" },
  tabs: { flexDirection: "row", backgroundColor: "#1F2C34", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: "center", backgroundColor: "#2A3942" },
  tabActive: { backgroundColor: "#00A884" },
  tabTxt: { color: "#8696A0", fontSize: 14, fontWeight: "600" },
  tabTxtActive: { color: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: "#E9EEF0", fontSize: 18, fontWeight: "600" },
  emptySub: { color: "#8696A0", fontSize: 14 },
  card: { backgroundColor: "#1F2C34", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "flex-start" },
  cardPaid: { opacity: 0.6 },
  debtorName: { color: "#E9EEF0", fontSize: 16, fontWeight: "700" },
  amountText: { color: "#00A884", fontSize: 20, fontWeight: "800", marginVertical: 4 },
  noteText: { color: "#8696A0", fontSize: 14, marginBottom: 4 },
  metaText: { color: "#555E65", fontSize: 12 },
  paidBadge: { backgroundColor: "#00A88420", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  paidBadgeTxt: { color: "#00A884", fontSize: 12, fontWeight: "600" },
  payBtn: { },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: "#1F2C34", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, position: "absolute", bottom: 0, left: 0, right: 0 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { color: "#8696A0", fontSize: 13, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: "#2A3942", color: "#E9EEF0", borderRadius: 10, padding: 12, fontSize: 15 },
  saveBtn: { backgroundColor: "#00A884", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
