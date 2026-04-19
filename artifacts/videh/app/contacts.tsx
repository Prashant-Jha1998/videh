import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SectionList,
  Share,
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

interface DeviceContact {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
}

interface VidehContact extends DeviceContact {
  videhId: number;
  videhName: string;
  about?: string;
  avatarUrl?: string;
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("91") && digits.length === 13) return `+${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export default function ContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chats, user } = useApp();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "denied" | "done">("idle");
  const [videhContacts, setVidehContacts] = useState<VidehContact[]>([]);
  const [inviteContacts, setInviteContacts] = useState<DeviceContact[]>([]);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const loadContacts = useCallback(async () => {
    setStatus("loading");
    if (Platform.OS === "web") {
      setStatus("denied");
      return;
    }

    const { status: perm } = await Contacts.requestPermissionsAsync();
    if (perm !== "granted") { setStatus("denied"); return; }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });

    const seen = new Set<string>();
    const deviceContacts: DeviceContact[] = [];
    for (const c of data) {
      if (!c.name || !c.phoneNumbers?.length) continue;
      for (const pn of c.phoneNumbers) {
        const raw = pn.number ?? "";
        const norm = normalizePhone(raw);
        if (norm.length < 10 || seen.has(norm)) continue;
        seen.add(norm);
        deviceContacts.push({ id: `${c.id}_${norm}`, name: c.name, phone: raw, normalizedPhone: norm });
      }
    }

    const phones = [...seen];
    if (phones.length === 0) { setStatus("done"); return; }

    try {
      const res = await fetch(`${getApiUrl()}/api/users/check-phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      const json = await res.json();
      const registered: Record<string, any> = json.registered ?? {};

      const myPhone = user?.phone ?? "";
      const onVideh: VidehContact[] = [];
      const toInvite: DeviceContact[] = [];

      for (const c of deviceContacts) {
        if (c.normalizedPhone === myPhone) continue;
        const reg = registered[c.normalizedPhone];
        if (reg) {
          onVideh.push({ ...c, videhId: reg.id, videhName: reg.name ?? c.name, about: reg.about, avatarUrl: reg.avatarUrl });
        } else {
          toInvite.push(c);
        }
      }

      onVideh.sort((a, b) => a.videhName.localeCompare(b.videhName));
      toInvite.sort((a, b) => a.name.localeCompare(b.name));
      setVidehContacts(onVideh);
      setInviteContacts(toInvite);
    } catch {
      setInviteContacts(deviceContacts);
    }

    setStatus("done");
  }, [user?.phone]);

  useEffect(() => { loadContacts(); }, []);

  const openChat = (contact: VidehContact) => {
    // Check if chat already exists by otherUserId or by name
    const existing = chats.find(
      (ch) => !ch.isGroup && (ch.otherUserId === contact.videhId || ch.name === contact.videhName)
    );
    if (existing) {
      router.replace({ pathname: "/chat/[id]", params: { id: existing.id, name: contact.videhName } });
    } else {
      router.replace({
        pathname: "/chat/[id]",
        params: {
          id: `new_${contact.videhId}`,
          name: contact.videhName,
          otherUserId: String(contact.videhId),
          otherAvatar: contact.avatarUrl ?? "",
        },
      });
    }
  };

  const inviteContact = async (contact: DeviceContact) => {
    try {
      await Share.share({
        message: `Hey ${contact.name}! I'm using Videh — a fast, secure messaging app. Join me here: https://videh.app`,
        title: "Invite to Videh",
      });
    } catch {}
  };

  const filteredVideh = videhContacts.filter(
    (c) => c.videhName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );
  const filteredInvite = inviteContacts.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const sections = [
    ...(filteredVideh.length > 0 ? [{ title: `On Videh  ·  ${filteredVideh.length}`, data: filteredVideh, type: "videh" }] : []),
    ...(filteredInvite.length > 0 ? [{ title: "Invite to Videh", data: filteredInvite, type: "invite" }] : []),
  ];

  const renderItem = ({ item, section }: any) => {
    const isVideh = section.type === "videh";
    const name = isVideh ? (item as VidehContact).videhName : (item as DeviceContact).name;
    const phone = item.phone;
    const initials = name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    const hue = name.charCodeAt(0) * 37 % 360;
    const avatarBg = isVideh ? `hsl(${hue},50%,45%)` : colors.muted;

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => isVideh ? openChat(item) : inviteContact(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[styles.avatarText, { color: isVideh ? "#fff" : colors.mutedForeground }]}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          <Text style={[styles.phone, { color: colors.mutedForeground }]} numberOfLines={1}>
            {isVideh ? ((item as VidehContact).about || phone) : phone}
          </Text>
        </View>
        {isVideh ? (
          <TouchableOpacity onPress={() => openChat(item)} style={[styles.actionBtn, { backgroundColor: colors.primary + "18" }]}>
            <Ionicons name="chatbubble" size={16} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => inviteContact(item)} style={[styles.inviteBtn, { borderColor: colors.primary }]}>
            <Text style={[styles.inviteBtnText, { color: colors.primary }]}>Invite</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Select contact</Text>
          {status === "done" && (
            <Text style={styles.headerSub}>{videhContacts.length} on Videh</Text>
          )}
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={loadContacts}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search name or number"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {status === "loading" ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading contacts…</Text>
        </View>
      ) : status === "denied" ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={64} color={colors.mutedForeground} />
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Contacts access needed</Text>
          <Text style={[styles.permText, { color: colors.mutedForeground }]}>
            {Platform.OS === "web"
              ? "Contacts access is only available on the mobile app."
              : "Allow Videh to access your contacts to find friends on Videh."}
          </Text>
          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: colors.primary }]}
              onPress={loadContacts}
            >
              <Text style={styles.grantBtnText}>Grant Access</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>{section.title}</Text>
            </View>
          )}
          ListHeaderComponent={
            <TouchableOpacity
              style={[styles.newGroup, { borderBottomColor: colors.border }]}
              onPress={() => router.push("/new-group")}
            >
              <View style={[styles.newGroupIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="people" size={22} color="#fff" />
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.foreground }]}>New group</Text>
                <Text style={[styles.phone, { color: colors.mutedForeground }]}>Create a group with contacts</Text>
              </View>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            status === "done" ? (
              <View style={styles.centered}>
                <Ionicons name="people-outline" size={60} color={colors.mutedForeground} />
                <Text style={[styles.permTitle, { color: colors.foreground }]}>
                  {search ? "No contacts found" : "No contacts on Videh yet"}
                </Text>
                <Text style={[styles.permText, { color: colors.mutedForeground }]}>
                  {search ? `No results for "${search}"` : "Invite your contacts to join Videh!"}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 10, gap: 8 },
  backBtn: { padding: 8 },
  headerText: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  headerBtn: { padding: 8 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderBottomWidth: 0.5 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, marginTop: 80, gap: 14 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 8 },
  permTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  permText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  grantBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 50, marginTop: 4 },
  grantBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 10 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },
  newGroup: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, gap: 14 },
  newGroupIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  info: { flex: 1 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  phone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  inviteBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5 },
  inviteBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
