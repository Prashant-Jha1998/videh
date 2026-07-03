import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
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
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();
const MIN_LEAD_MS = 60_000;

type ScheduledMsg = {
  id: number;
  content: string;
  scheduled_at: string;
  sender_name: string;
  type: string;
};

type QuickPreset = { id: string; label: string; build: () => Date };

function roundToNext5Min(from: Date): Date {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const remainder = d.getMinutes() % 5;
  if (remainder !== 0) d.setMinutes(d.getMinutes() + (5 - remainder));
  if (d.getTime() <= from.getTime()) d.setMinutes(d.getMinutes() + 5);
  return d;
}

function defaultScheduleTime(): Date {
  return roundToNext5Min(new Date(Date.now() + 60 * 60 * 1000));
}

function atTimeTodayOrTomorrow(hour: number, minute: number): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now() + MIN_LEAD_MS) d.setDate(d.getDate() + 1);
  return d;
}

function tomorrowAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setSeconds(0, 0);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextWeekdayAt(day: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  const diff = (day - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now() + MIN_LEAD_MS) d.setDate(d.getDate() + 7);
  return d;
}

const QUICK_PRESETS: QuickPreset[] = [
  { id: "1h", label: "In 1 hour", build: () => roundToNext5Min(new Date(Date.now() + 60 * 60 * 1000)) },
  { id: "tonight", label: "Tonight 8 PM", build: () => atTimeTodayOrTomorrow(20, 0) },
  { id: "tomorrow-am", label: "Tomorrow 9 AM", build: () => tomorrowAt(9, 0) },
  { id: "tomorrow-pm", label: "Tomorrow 6 PM", build: () => tomorrowAt(18, 0) },
  { id: "monday", label: "Monday 9 AM", build: () => nextWeekdayAt(1, 9, 0) },
];

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLabel(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatSendPreview(d: Date): string {
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const dayPart = isToday ? "Today" : isTomorrow ? "Tomorrow" : formatDateLabel(d);
  return `${dayPart} at ${formatTimeLabel(d)}`;
}

function formatListWhen(iso: string): string {
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  if (diffMs > 0 && diffMs < 86_400_000) {
    const hrs = Math.floor(diffMs / 3_600_000);
    const mins = Math.floor((diffMs % 3_600_000) / 60_000);
    if (hrs < 1) return `in ${Math.max(1, mins)} min`;
    return `in ${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim();
  }
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function mergeDatePart(base: Date, picked: Date): Date {
  const merged = new Date(base);
  merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return merged;
}

function mergeTimePart(base: Date, picked: Date): Date {
  const merged = new Date(base);
  merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return merged;
}

export default function ScheduledScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [messages, setMessages] = useState<ScheduledMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduleTime);
  const [activePreset, setActivePreset] = useState<string | null>("1h");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!chatId) return;
    try {
      const r = await fetch(`${BASE_URL}/api/scheduled/chat/${chatId}`);
      const d = await r.json();
      if (d.success) setMessages(d.messages);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [chatId]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = useCallback(() => {
    setNewText("");
    setScheduledAt(defaultScheduleTime());
    setActivePreset("1h");
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowAdd(true);
  }, []);

  const applyPreset = useCallback((preset: QuickPreset) => {
    setScheduledAt(preset.build());
    setActivePreset(preset.id);
  }, []);

  const onPickerDate = useCallback(
    (event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(false);
      if (event.type === "dismissed" || !picked) return;
      setScheduledAt((prev) => mergeDatePart(prev, picked));
      setActivePreset(null);
      if (Platform.OS === "android") setShowTimePicker(true);
    },
    [],
  );

  const onPickerTime = useCallback(
    (event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === "android") setShowTimePicker(false);
      if (event.type === "dismissed" || !picked) return;
      setScheduledAt((prev) => mergeTimePart(prev, picked));
      setActivePreset(null);
    },
    [],
  );

  const isValidSchedule = useMemo(
    () => scheduledAt.getTime() > Date.now() + MIN_LEAD_MS,
    [scheduledAt],
  );

  const schedule = async () => {
    if (!newText.trim()) {
      Alert.alert("Message required", "Type what you want to send.");
      return;
    }
    if (!isValidSchedule) {
      Alert.alert("Pick a later time", "Schedule at least 1 minute from now.");
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
          scheduledAt: scheduledAt.toISOString(),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        load();
      } else {
        Alert.alert("Could not schedule", d.message ?? "Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Check connection and try again.");
    }
    setSaving(false);
  };

  const cancel = (id: number) => {
    Alert.alert("Cancel scheduled message?", "It will not be sent.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await fetch(`${BASE_URL}/api/scheduled/${id}`, { method: "DELETE" });
          load();
        },
      },
    ]);
  };

  const maxScheduleDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Scheduled messages</Text>
          {name ? <Text style={styles.headerSub}>{name}</Text> : null}
        </View>
        <Pressable onPress={openAdd} style={styles.addBtn} hitSlop={8}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#059669" style={{ marginTop: 40 }} />
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="time-outline" size={40} color="#059669" />
          </View>
          <Text style={styles.emptyText}>No scheduled messages</Text>
          <Text style={styles.emptySub}>Send later — birthday wishes, reminders, or follow-ups.</Text>
          <Pressable style={styles.emptyCta} onPress={openAdd}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.emptyCtaText}>Schedule a message</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardIcon}>
                <Ionicons name="alarm-outline" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardWhen}>{formatListWhen(item.scheduled_at)}</Text>
                <Text style={styles.cardMeta}>
                  {new Date(item.scheduled_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </Text>
                <Text style={styles.cardContent} numberOfLines={4}>
                  {item.content}
                </Text>
              </View>
              <Pressable onPress={() => cancel(item.id)} style={styles.delBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#E74C3C" />
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 12, maxHeight: "92%" }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule message</Text>
              <Pressable onPress={() => setShowAdd(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#8696A0" />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <Text style={styles.label}>Message</Text>
              <TextInput
                style={styles.input}
                placeholder="What should we send?"
                placeholderTextColor="#667781"
                value={newText}
                onChangeText={setNewText}
                multiline
                maxLength={1000}
                selectionColor="#059669"
              />
              <Text style={styles.charCount}>{newText.length}/1000</Text>

              <Text style={styles.label}>Quick pick</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {QUICK_PRESETS.map((p) => {
                  const active = activePreset === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => applyPreset(p)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>When to send</Text>

              {Platform.OS === "ios" ? (
                <View style={styles.iosPickerBlock}>
                  <DateTimePicker
                    value={scheduledAt}
                    mode="date"
                    display="compact"
                    minimumDate={new Date()}
                    maximumDate={maxScheduleDate}
                    themeVariant="dark"
                    accentColor="#059669"
                    onChange={(_, d) => {
                      if (d) {
                        setScheduledAt((prev) => mergeDatePart(prev, d));
                        setActivePreset(null);
                      }
                    }}
                  />
                  <DateTimePicker
                    value={scheduledAt}
                    mode="time"
                    display="compact"
                    minuteInterval={5}
                    themeVariant="dark"
                    accentColor="#059669"
                    onChange={(_, d) => {
                      if (d) {
                        setScheduledAt((prev) => mergeTimePart(prev, d));
                        setActivePreset(null);
                      }
                    }}
                  />
                </View>
              ) : (
                <>
                  <Pressable style={styles.pickerRow} onPress={() => setShowDatePicker(true)}>
                    <View style={styles.pickerRowIcon}>
                      <Ionicons name="calendar-outline" size={20} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerRowLabel}>Date</Text>
                      <Text style={styles.pickerRowValue}>{formatDateLabel(scheduledAt)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#667781" />
                  </Pressable>
                  <Pressable style={styles.pickerRow} onPress={() => setShowTimePicker(true)}>
                    <View style={styles.pickerRowIcon}>
                      <Ionicons name="time-outline" size={20} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerRowLabel}>Time</Text>
                      <Text style={styles.pickerRowValue}>{formatTimeLabel(scheduledAt)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#667781" />
                  </Pressable>
                </>
              )}

              <View style={[styles.previewBox, !isValidSchedule && styles.previewBoxWarn]}>
                <Ionicons
                  name={isValidSchedule ? "paper-plane-outline" : "warning-outline"}
                  size={18}
                  color={isValidSchedule ? "#059669" : "#E9A23B"}
                />
                <Text style={[styles.previewText, !isValidSchedule && styles.previewTextWarn]}>
                  {isValidSchedule
                    ? `Will send ${formatSendPreview(scheduledAt)}`
                    : "Choose a time at least 1 minute from now"}
                </Text>
              </View>
            </ScrollView>

            <Pressable
              style={[styles.schedBtn, (saving || !isValidSchedule) && styles.schedBtnDisabled]}
              onPress={() => void schedule()}
              disabled={saving || !isValidSchedule}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="alarm" size={20} color="#fff" />
                  <Text style={styles.schedBtnTxt}>Schedule message</Text>
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker ? (
        <DateTimePicker
          value={scheduledAt}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={new Date()}
          maximumDate={maxScheduleDate}
          onChange={onPickerDate}
        />
      ) : null}
      {showTimePicker ? (
        <DateTimePicker
          value={scheduledAt}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minuteInterval={5}
          onChange={onPickerTime}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14131F" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1D2E",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  headerSub: { color: "#8696A0", fontSize: 13, marginTop: 2 },
  addBtn: { padding: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 10 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,168,132,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  emptySub: { color: "#8696A0", fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  emptyCtaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  card: {
    backgroundColor: "#1E1D2E",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,168,132,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardWhen: { color: "#059669", fontSize: 14, fontWeight: "700" },
  cardMeta: { color: "#8696A0", fontSize: 12, marginTop: 2, marginBottom: 6 },
  cardContent: { color: "#E9EDEF", fontSize: 15, lineHeight: 22 },
  delBtn: { padding: 4 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  modal: {
    backgroundColor: "#1E1D2E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: "100%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3B4A54",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  label: { color: "#E9EDEF", fontSize: 14, fontWeight: "600", marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: "#2A2838",
    color: "#E9EDEF",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 88,
    textAlignVertical: "top",
  },
  charCount: { color: "#667781", fontSize: 12, textAlign: "right", marginTop: 4 },
  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#2A2838",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { backgroundColor: "rgba(0,168,132,0.2)", borderColor: "#059669" },
  chipText: { color: "#8696A0", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#00E5B0" },
  iosPickerBlock: { gap: 4, marginBottom: 4 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2838",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  pickerRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,168,132,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerRowLabel: { color: "#8696A0", fontSize: 12 },
  pickerRowValue: { color: "#E9EDEF", fontSize: 16, fontWeight: "600", marginTop: 2 },
  previewBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,168,132,0.12)",
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  previewBoxWarn: { backgroundColor: "rgba(233,162,59,0.12)" },
  previewText: { flex: 1, color: "#00E5B0", fontSize: 14, fontWeight: "500", lineHeight: 20 },
  previewTextWarn: { color: "#E9A23B" },
  schedBtn: {
    backgroundColor: "#059669",
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  schedBtnDisabled: { opacity: 0.45 },
  schedBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
