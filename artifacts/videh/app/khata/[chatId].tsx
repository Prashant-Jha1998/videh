import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  reminder_at?: string | null;
  reminder_sent?: boolean;
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

type PartyMode = "member" | "manual";

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

function defaultReminderDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatReminderLabel(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function KhataScreen() {
  const params = useLocalSearchParams<{
    chatId: string;
    name?: string;
    fromChat?: string;
    manual?: string;
    peerUserId?: string;
    isGroup?: string;
  }>();
  const chatId = params.chatId;
  const name = params.name;
  const fromChat = params.fromChat === "1";
  const manualMode = params.manual === "1";
  const peerUserId = params.peerUserId ? Number(params.peerUserId) : null;
  const isGroupChat = params.isGroup === "1";
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
  const [debtorMode, setDebtorMode] = useState<PartyMode>("member");
  const [creditorMode, setCreditorMode] = useState<PartyMode>("member");
  const [debtorManualName, setDebtorManualName] = useState("");
  const [creditorManualName, setCreditorManualName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [manualPick, setManualPick] = useState(manualMode);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderAt, setReminderAt] = useState(defaultReminderDate);
  const [showReminderDatePicker, setShowReminderDatePicker] = useState(false);
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

  const oneToOneAuto = fromChat && !manualMode && !manualPick && !!peerUserId && !isGroupChat && !!selfId;
  const groupCreditorAuto = fromChat && !manualMode && !manualPick && isGroupChat && !!selfId;

  const resetPartyFields = useCallback(() => {
    setDebtorMode("member");
    setCreditorMode("member");
    setDebtorManualName("");
    setCreditorManualName("");
    setDebtorUserId(null);
    setCreditorUserId(selfId);
  }, [selfId]);

  const openAdd = useCallback(() => {
    setAmount("");
    setNote("");
    setReminderEnabled(false);
    setReminderAt(defaultReminderDate());
    setShowReminderDatePicker(false);
    setManualPick(manualMode);
    setDebtorMode("member");
    setCreditorMode("member");
    setDebtorManualName("");
    setCreditorManualName("");

    if (fromChat && !manualMode && selfId) {
      setCreditorUserId(selfId);
      setCreditorMode("member");
      if (peerUserId && !isGroupChat) {
        setDebtorUserId(peerUserId);
        setDebtorMode("member");
      } else {
        setDebtorUserId(null);
      }
    } else {
      setCreditorUserId(selfId);
      setDebtorUserId(null);
    }
    setShowAdd(true);
  }, [fromChat, manualMode, selfId, peerUserId, isGroupChat]);

  const debtorLabel = useMemo(() => {
    if (debtorMode === "manual") return debtorManualName.trim() || "Enter name";
    if (!debtorUserId) return "Select member";
    return members.find((m) => m.id === debtorUserId)?.name ?? "Member";
  }, [debtorMode, debtorManualName, debtorUserId, members]);

  const creditorLabel = useMemo(() => {
    if (creditorMode === "manual") return creditorManualName.trim() || "Enter name";
    if (!creditorUserId) return "Select member";
    return members.find((m) => m.id === creditorUserId)?.name ?? "Member";
  }, [creditorMode, creditorManualName, creditorUserId, members]);

  const addEntry = async () => {
    const parsedAmount = Number(amount);
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Incomplete", "Enter a valid amount.");
      return;
    }
    if (debtorMode === "member" && !debtorUserId) {
      Alert.alert("Incomplete", "Select who owes, or switch to “Not on Videh” and type a name.");
      return;
    }
    if (debtorMode === "manual" && !debtorManualName.trim()) {
      Alert.alert("Incomplete", "Enter who owes (name).");
      return;
    }
    if (creditorMode === "member" && !creditorUserId) {
      Alert.alert("Incomplete", "Select who lent, or switch to “Not on Videh” and type a name.");
      return;
    }
    if (creditorMode === "manual" && !creditorManualName.trim()) {
      Alert.alert("Incomplete", "Enter who lent (name).");
      return;
    }
    if (debtorMode === "member" && creditorMode === "member" && debtorUserId === creditorUserId) {
      Alert.alert("Invalid", "Debtor and creditor must be different people.");
      return;
    }
    if (
      debtorMode === "manual"
      && creditorMode === "manual"
      && debtorManualName.trim().toLowerCase() === creditorManualName.trim().toLowerCase()
    ) {
      Alert.alert("Invalid", "Debtor and creditor cannot be the same.");
      return;
    }
    if (reminderEnabled && reminderAt.getTime() <= Date.now() + 60_000) {
      Alert.alert("Reminder date", "Choose a future date for the auto reminder.");
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
          amount: parsedAmount,
          note: note.trim() || null,
          enableReminder: reminderEnabled,
          ...(reminderEnabled ? { reminderAt: reminderAt.toISOString() } : {}),
          ...(debtorMode === "member"
            ? { debtorUserId }
            : { debtorName: debtorManualName.trim() }),
          ...(creditorMode === "member"
            ? { creditorUserId }
            : { creditorName: creditorManualName.trim() }),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        await load();
        if (d.reminderScheduled) {
          Alert.alert(
            "Entry saved",
            `A polite Videh reminder will be sent in this chat on ${formatReminderLabel(reminderAt)}, even if someone has blocked the other person.`,
          );
        }
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

  const renderPartyPicker = (
    title: string,
    mode: PartyMode,
    setMode: (m: PartyMode) => void,
    userId: number | null,
    setUserId: (id: number | null) => void,
    manualName: string,
    setManualName: (name: string) => void,
    excludeUserId: number | null,
    manualPlaceholder: string,
  ) => (
    <View style={styles.partyBlock}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, mode === "member" && styles.modeChipActive]}
          onPress={() => setMode("member")}
        >
          <Text style={[styles.modeChipText, mode === "member" && styles.modeChipTextActive]}>Videh member</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, mode === "manual" && styles.modeChipActive]}
          onPress={() => {
            setMode("manual");
            setUserId(null);
          }}
        >
          <Text style={[styles.modeChipText, mode === "manual" && styles.modeChipTextActive]}>Not on Videh</Text>
        </Pressable>
      </View>
      {mode === "member" ? (
        <>
          <View style={styles.chipRow}>
            {members
              .filter((m) => m.id !== excludeUserId)
              .map((m) =>
                renderMemberChip(m, userId === m.id, () => {
                  setUserId(m.id);
                  setManualName("");
                }),
              )}
          </View>
          <Text style={styles.pickerHint}>Selected: {userId ? members.find((m) => m.id === userId)?.name ?? "Member" : "Pick someone"}</Text>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder={manualPlaceholder}
            placeholderTextColor="#667781"
            value={manualName}
            onChangeText={setManualName}
            autoCapitalize="words"
          />
          <Text style={styles.pickerHint}>No Videh account needed — for shop, family, office, etc.</Text>
        </>
      )}
    </View>
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
        <Pressable onPress={openAdd} style={styles.iconBtn}>
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
                    {!item.debtor_user_id ? (
                      <View style={styles.manualTag}><Text style={styles.manualTagTxt}>manual</Text></View>
                    ) : null}
                    <Ionicons name="arrow-forward" size={14} color="#8696A0" />
                    <Text style={styles.creditorName}>{creditor}</Text>
                    {!item.creditor_user_id ? (
                      <View style={styles.manualTag}><Text style={styles.manualTagTxt}>manual</Text></View>
                    ) : null}
                    {item.paid && (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeTxt}>✓ Paid</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.amountText}>₹{Number(item.amount).toFixed(2)}</Text>
                  {item.note ? <Text style={styles.noteText}>{item.note}</Text> : null}
                  {item.reminder_at && !item.paid && !item.reminder_sent ? (
                    <View style={styles.reminderBadge}>
                      <Ionicons name="alarm-outline" size={12} color="#00A884" />
                      <Text style={styles.reminderBadgeTxt}>
                        Reminder {formatReminderLabel(new Date(item.reminder_at))}
                      </Text>
                    </View>
                  ) : null}
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

              {oneToOneAuto ? (
                <>
                  <View style={styles.autoBox}>
                    <View style={styles.autoRow}>
                      <Text style={styles.autoLabel}>Who owes</Text>
                      <Text style={styles.autoValue}>{debtorLabel}</Text>
                    </View>
                    <View style={styles.autoRow}>
                      <Text style={styles.autoLabel}>Who lent</Text>
                      <Text style={styles.autoValue}>{creditorLabel}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      setManualPick(true);
                      setDebtorMode("member");
                      setCreditorMode("member");
                    }}
                    style={styles.changeBtn}
                  >
                    <Ionicons name="create-outline" size={16} color="#00A884" />
                    <Text style={styles.changeBtnTxt}>Change people or add manual name</Text>
                  </Pressable>
                </>
              ) : groupCreditorAuto ? (
                <>
                  <View style={styles.autoBox}>
                    <View style={styles.autoRow}>
                      <Text style={styles.autoLabel}>Who lent</Text>
                      <Text style={styles.autoValue}>{creditorLabel}</Text>
                    </View>
                  </View>
                  {renderPartyPicker(
                    "Who owes (debtor)",
                    debtorMode,
                    setDebtorMode,
                    debtorUserId,
                    setDebtorUserId,
                    debtorManualName,
                    setDebtorManualName,
                    creditorMode === "member" ? creditorUserId : null,
                    "e.g. Ramesh, Kirana shop, Papa…",
                  )}
                  <Pressable
                    onPress={() => {
                      setManualPick(true);
                      setCreditorMode("member");
                      setCreditorUserId(selfId);
                    }}
                    style={styles.changeBtn}
                  >
                    <Ionicons name="create-outline" size={16} color="#00A884" />
                    <Text style={styles.changeBtnTxt}>Change creditor or manual name</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {manualMode ? (
                    <Text style={styles.manualBanner}>
                      Record expenses for this chat — pick Videh members or type any name (not on Videh).
                    </Text>
                  ) : null}
                  {fromChat && !manualMode ? (
                    <Pressable
                      onPress={() => {
                        setManualPick(false);
                        resetPartyFields();
                        if (selfId) {
                          setCreditorUserId(selfId);
                          if (peerUserId && !isGroupChat) setDebtorUserId(peerUserId);
                        }
                      }}
                      style={styles.backAutoBtn}
                    >
                      <Text style={styles.backAutoTxt}>Use auto-fill from this chat</Text>
                    </Pressable>
                  ) : null}
                  {renderPartyPicker(
                    "Who owes (debtor)",
                    debtorMode,
                    setDebtorMode,
                    debtorUserId,
                    setDebtorUserId,
                    debtorManualName,
                    setDebtorManualName,
                    creditorMode === "member" ? creditorUserId : null,
                    "e.g. Ramesh, Kirana shop, Office…",
                  )}
                  {renderPartyPicker(
                    "Who lent (creditor)",
                    creditorMode,
                    setCreditorMode,
                    creditorUserId,
                    setCreditorUserId,
                    creditorManualName,
                    setCreditorManualName,
                    debtorMode === "member" ? debtorUserId : null,
                    "e.g. You, Papa, Friend…",
                  )}
                  {selfId ? (
                    <View style={styles.quickRow}>
                      <Pressable
                        style={styles.quickBtn}
                        onPress={() => {
                          setCreditorMode("member");
                          setCreditorUserId(selfId);
                          setCreditorManualName("");
                        }}
                      >
                        <Text style={styles.quickBtnText}>I lent (I am creditor)</Text>
                      </Pressable>
                      <Pressable
                        style={styles.quickBtn}
                        onPress={() => {
                          setDebtorMode("member");
                          setDebtorUserId(selfId);
                          setDebtorManualName("");
                        }}
                      >
                        <Text style={styles.quickBtnText}>I owe (I am debtor)</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}

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

              <View style={styles.reminderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>Auto reminder</Text>
                  <Text style={styles.reminderSub}>
                    Videh sends a polite reminder in this chat on your chosen date — even if someone blocked the other person.
                  </Text>
                </View>
                <Switch
                  value={reminderEnabled}
                  onValueChange={setReminderEnabled}
                  trackColor={{ false: "#3B4A54", true: "#00A88480" }}
                  thumbColor={reminderEnabled ? "#00A884" : "#8696A0"}
                />
              </View>

              {reminderEnabled ? (
                <>
                  {Platform.OS === "ios" ? (
                    <DateTimePicker
                      value={reminderAt}
                      mode="date"
                      display="compact"
                      minimumDate={new Date()}
                      themeVariant="dark"
                      accentColor="#00A884"
                      onChange={(_, d) => { if (d) setReminderAt(d); }}
                    />
                  ) : (
                    <Pressable style={styles.pickerRow} onPress={() => setShowReminderDatePicker(true)}>
                      <Ionicons name="calendar-outline" size={20} color="#00A884" />
                      <Text style={styles.pickerRowTxt}>{formatReminderLabel(reminderAt)}</Text>
                      <Ionicons name="chevron-forward" size={18} color="#667781" />
                    </Pressable>
                  )}
                  <View style={styles.previewReminder}>
                    <Text style={styles.previewReminderTxt}>
                      Preview: Namaste reminder with amount and a kind note from Videh.
                    </Text>
                  </View>
                </>
              ) : null}

              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => void addEntry()} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Save entry</Text>}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {showReminderDatePicker ? (
        <DateTimePicker
          value={reminderAt}
          mode="date"
          minimumDate={new Date()}
          onChange={(event: DateTimePickerEvent, d?: Date) => {
            setShowReminderDatePicker(false);
            if (event.type !== "dismissed" && d) setReminderAt(d);
          }}
        />
      ) : null}
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
  autoBox: { backgroundColor: "#2A3942", borderRadius: 12, padding: 14, gap: 10 },
  autoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  autoLabel: { color: "#8696A0", fontSize: 13 },
  autoValue: { color: "#E9EDEF", fontSize: 16, fontWeight: "700", flex: 1, textAlign: "right" },
  changeBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8, marginBottom: 4 },
  changeBtnTxt: { color: "#00A884", fontSize: 14, fontWeight: "600" },
  backAutoBtn: { marginBottom: 8 },
  backAutoTxt: { color: "#00A884", fontSize: 13, fontWeight: "600" },
  reminderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  reminderTitle: { color: "#E9EDEF", fontSize: 15, fontWeight: "700" },
  reminderSub: { color: "#8696A0", fontSize: 12, lineHeight: 17, marginTop: 4 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#2A3942",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  pickerRowTxt: { flex: 1, color: "#E9EDEF", fontSize: 15, fontWeight: "600" },
  previewReminder: {
    backgroundColor: "rgba(0,168,132,0.12)",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  previewReminderTxt: { color: "#00E5B0", fontSize: 12, lineHeight: 17 },
  reminderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  reminderBadgeTxt: { color: "#00A884", fontSize: 12, fontWeight: "600" },
  partyBlock: { marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  modeChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#2A3942",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  modeChipActive: { backgroundColor: "rgba(0,168,132,0.2)", borderColor: "#00A884" },
  modeChipText: { color: "#8696A0", fontSize: 12, fontWeight: "700" },
  modeChipTextActive: { color: "#00E5B0" },
  manualBanner: {
    color: "#8696A0",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    backgroundColor: "#2A3942",
    padding: 12,
    borderRadius: 10,
  },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickBtn: {
    flex: 1,
    backgroundColor: "#2A3942",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  quickBtnText: { color: "#00A884", fontSize: 12, fontWeight: "700" },
  manualTag: {
    backgroundColor: "#3B4A54",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  manualTagTxt: { color: "#8696A0", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
});
