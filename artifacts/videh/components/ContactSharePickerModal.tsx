import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { loadDeviceContactsForShare, type ContactShareRow } from "@/lib/loadDeviceContactsForShare";

type SectionRow =
  | { kind: "header"; key: string; title: string }
  | { kind: "contact"; key: string; item: ContactShareRow };

type Props = {
  visible: boolean;
  colors: {
    background: string;
    foreground: string;
    mutedForeground: string;
    border: string;
    card: string;
    primary: string;
    isDark?: boolean;
  };
  onClose: () => void;
  onPick: (row: ContactShareRow) => void;
};

function buildFlatRows(rows: ContactShareRow[], query: string): SectionRow[] {
  const qRaw = query.trim().toLowerCase();
  const qDigits = qRaw.replace(/\D/g, "");
  const filtered = rows.filter((r) => {
    if (!qRaw) return true;
    if (r.name.toLowerCase().includes(qRaw)) return true;
    if (qDigits.length > 0 && r.phones.some((p) => p.replace(/\D/g, "").includes(qDigits))) return true;
    return false;
  });

  const out: SectionRow[] = [];
  let lastSection = "";
  for (const item of filtered) {
    const ch = (item.name.charAt(0) || "#").toUpperCase();
    const section = /[A-Z]/.test(ch) ? ch : "#";
    if (section !== lastSection) {
      out.push({ kind: "header", key: `h_${section}_${out.length}`, title: section });
      lastSection = section;
    }
    out.push({ kind: "contact", key: `c_${item.id}`, item });
  }
  return out;
}

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  const letters = name.replace(/[^a-zA-Z\u0900-\u097F]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  return (name.charAt(0) || "?").toUpperCase();
}

export function ContactSharePickerModal({ visible, colors, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ContactShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGen = useRef(0);

  const reset = useCallback(() => {
    setQuery("");
    setError(null);
    setLoading(false);
  }, []);

  const close = useCallback(() => {
    loadGen.current += 1;
    reset();
    onClose();
  }, [onClose, reset]);

  const loadContacts = useCallback(async (force = false) => {
    const gen = ++loadGen.current;
    setLoading(true);
    setError(null);
    try {
      const list = await loadDeviceContactsForShare({ forceRefresh: force });
      if (gen !== loadGen.current) return;
      if (!list.length) {
        setRows([]);
        setError("No contacts found on this device.");
        return;
      }
      setRows(list);
    } catch (e) {
      if (gen !== loadGen.current) return;
      setRows([]);
      const msg = e instanceof Error ? e.message : "Could not load contacts.";
      setError(msg);
      if (msg.includes("denied")) {
        Alert.alert(
          "Permission required",
          "Allow Contacts access in Settings to share contacts.",
          [{ text: "OK", onPress: close }],
        );
      }
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [close]);

  useEffect(() => {
    if (!visible) return;
    void loadContacts(false);
    return () => {
      loadGen.current += 1;
    };
  }, [visible, loadContacts]);

  const flatData = useMemo(() => buildFlatRows(rows, query), [rows, query]);

  const renderRow = useCallback(
    ({ item: row }: { item: SectionRow }) => {
      if (row.kind === "header") {
        return (
          <View style={[styles.sectionHeader, { backgroundColor: colors.isDark ? "#1e2a30" : "#f0f2f5" }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>{row.title}</Text>
          </View>
        );
      }
      const c = row.item;
      const hue = ((c.name.charCodeAt(0) || 32) * 37) % 360;
      return (
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={() => onPick(c)}
          activeOpacity={0.65}
        >
          <View style={[styles.avatar, { backgroundColor: `hsl(${hue},42%,42%)` }]}>
            <Text style={styles.avatarTxt}>{contactInitials(c.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {c.name}
            </Text>
            {c.phones[0] ? (
              <Text style={[styles.phone, { color: colors.mutedForeground }]} numberOfLines={1}>
                {c.phones[0]}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [colors, onPick],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={close}
    >
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={close} style={styles.back} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Send contacts</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {loading ? "Loading…" : `${rows.length} contacts`}
            </Text>
          </View>
          {!loading ? (
            <TouchableOpacity onPress={() => void loadContacts(true)} hitSlop={12} style={styles.refresh}>
              <Ionicons name="refresh" size={22} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search name or number"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            editable={!loading}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading contacts…</Text>
          </View>
        ) : error && rows.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => void loadContacts(true)}>
              <Text style={styles.retryTxt}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={24}
            maxToRenderPerBatch={20}
            windowSize={9}
            removeClippedSubviews={Platform.OS === "android"}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                  {query.trim() ? "No contacts match your search." : "No contacts to show."}
                </Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: 8, marginRight: 4 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  refresh: { padding: 8, width: 40, alignItems: "center" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 10 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  name: { fontSize: 16, fontFamily: "Inter_500Medium" },
  phone: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
});
