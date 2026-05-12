import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

type ScheduledMsg = {
  id: number;
  content: string;
  scheduled_at: string;
  sender_name: string;
  type: string;
};

export default function ScheduledScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [messages, setMessages] = useState<ScheduledMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!chatId) return;
    try {
      const r = await fetch(`${BASE_URL}/api/scheduled/chat/${chatId}`);
      const d = await r.json();
      if (d.success) setMessages(d.messages);
    } catch {}
    setLoading(false);
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const schedule = async () => {
    if (!newText.trim() || !schedDate || !schedTime) {
      Alert.alert("Incomplete", "Message text, date, and time are all required.");
      return;
    }
    const isoStr = `${schedDate}T${schedTime}:00`;
    const dt = new Date(isoStr);
    if (isNaN(dt.getTime()) || dt <= new Date()) {
      Alert.alert("Invalid time", "Please choose a future time.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: Number(chatId),
          senderId: user?.dbId,
          content: newText.trim(),
          scheduledAt: dt.toISOString(),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        setNewText("");
        setSchedDate("");
        setSchedTime("");
        load();
      } else {
        Alert.alert("Error", d.message);
      }
    } catch { Alert.alert("Error", "Network error"); }
    setSaving(false);
  };

  const cancel = (id: number) => {
    Alert.alert("Cancel message?", "This scheduled message will be deleted.", [
      { text: "Yes, delete", style: "destructive", onPress: async () => {
        await fetch(`${BASE_URL}/api/scheduled/${id}`, { method: "DELETE" });
        load();
      }},
      { text: "No" },
    ]);
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Scheduled Messages</Text>
          {name ? <Text style={styles.headerSub}>{name}</Text> : null}
        </View>
        <Pressable onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#00A884" style={{ marginTop: 40 }} />
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={64} color="#555" />
          <Text style={styles.emptyText}>No scheduled messages yet</Text>
          <Text style={styles.emptySub}>Use the + button to schedule a message</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTime}>
                  <Ionicons name="time-outline" size={13} color="#00A884" /> {fmtTime(item.scheduled_at)}
                </Text>
                <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
              </View>
              <Pressable onPress={() => cancel(item.id)} style={styles.delBtn}>
                <Ionicons name="close-circle" size={22} color="#E74C3C" />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.modalTitle}>Schedule Message</Text>

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={styles.input}
            placeholder="Type your message here..."
            placeholderTextColor="#666"
            value={newText}
            onChangeText={setNewText}
            multiline
            maxLength={1000}
            selectionColor="#00A884"
          />

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.inputRow}
            placeholder={new Date().toISOString().slice(0, 10)}
            placeholderTextColor="#666"
            value={schedDate}
            onChangeText={setSchedDate}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            selectionColor="#00A884"
          />

          <Text style={styles.label}>Time (HH:MM) - 24 hour format</Text>
          <TextInput
            style={styles.inputRow}
            placeholder="08:30"
            placeholderTextColor="#666"
            value={schedTime}
            onChangeText={setSchedTime}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={5}
            selectionColor="#00A884"
          />

          <Pressable style={[styles.schedBtn, saving && { opacity: 0.6 }]} onPress={schedule} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.schedBtnTxt}>Schedule Message</Text>
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  emptySub: { color: "#8696A0", fontSize: 14 },
  card: { backgroundColor: "#1F2C34", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "flex-start" },
  cardTime: { color: "#00A884", fontSize: 13, marginBottom: 6 },
  cardContent: { color: "#E9EEF0", fontSize: 15, lineHeight: 22 },
  delBtn: { marginLeft: 10, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: "#1F2C34", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, width: "100%" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  label: { color: "#8696A0", fontSize: 13, marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: "#2A3942", color: "#E9EEF0", borderRadius: 10, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: "top" },
  inputRow: { backgroundColor: "#2A3942", color: "#E9EEF0", borderRadius: 10, padding: 12, fontSize: 15 },
  schedBtn: { backgroundColor: "#00A884", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
  schedBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
