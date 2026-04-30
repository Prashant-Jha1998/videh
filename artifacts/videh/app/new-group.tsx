import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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

interface GroupCandidate {
  id: number;
  name: string;
  phone: string;
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

export default function NewGroupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { createGroup } = useApp();
  const [selected, setSelected] = useState<number[]>([]);
  const [members, setMembers] = useState<GroupCandidate[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [search, setSearch] = useState("");
  const [groupAvatarUri, setGroupAvatarUri] = useState<string | undefined>();
  const [groupName, setGroupName] = useState("");
  const [step, setStep] = useState<"select" | "name">("select");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const loadGroupCandidates = useCallback(async () => {
    setLoadingMembers(true);
    try {
      if (Platform.OS === "web") {
        setMembers([]);
        setLoadingMembers(false);
        return;
      }
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        setMembers([]);
        setLoadingMembers(false);
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
        setMembers([]);
        setLoadingMembers(false);
        return;
      }
      const res = await fetch(`${getApiUrl()}/api/users/check-phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: Array.from(phones) }),
      });
      const data = await res.json() as { registered?: Record<string, any> };
      const registered = data.registered ?? {};
      const candidates = Object.values(registered).map((u: any) => ({
        id: Number(u.id),
        name: u.name ?? u.phone,
        phone: u.phone,
        about: u.about ?? undefined,
        avatarUrl: u.avatarUrl ?? undefined,
      })) as GroupCandidate[];
      candidates.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(candidates);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    loadGroupCandidates();
  }, [loadGroupCandidates]);

  const toggle = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const proceed = () => {
    if (selected.length < 1) {
      Alert.alert("Select participants", "Please select at least one participant.");
      return;
    }
    setStep("name");
  };

  const pickGroupPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Permission required", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setGroupAvatarUri(result.assets[0].uri);
    }
  };

  const create = () => {
    if (groupName.trim().length < 3) {
      Alert.alert("Invalid group name", "Group name should be at least 3 characters.");
      return;
    }
    createGroup(groupName.trim(), selected, groupAvatarUri);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)/chats");
  };

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter((m) =>
      m.name.toLowerCase().includes(query) || m.phone.includes(query),
    );
  }, [members, search]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => step === "name" ? setStep("select") : router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{step === "select" ? "New group" : "New group info"}</Text>
          {step === "select" && <Text style={styles.headerSub}>Add participants</Text>}
          {step === "name" && <Text style={styles.headerSub}>{selected.length} selected</Text>}
        </View>
      </View>

      {step === "select" ? (
        <>
          {selected.length > 0 && (
            <View style={[styles.selectedBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              {selected.map((id) => {
                const c = members.find((cc) => cc.id === id);
                if (!c) return null;
                return (
                  <TouchableOpacity key={id} onPress={() => toggle(id)} style={[styles.chip, { backgroundColor: colors.primary }]}>
                    <Text style={styles.chipText}>{c.name.split(" ")[0]}</Text>
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search name or number"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          {loadingMembers ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loaderText, { color: colors.mutedForeground }]}>Loading contacts on Videh...</Text>
            </View>
          ) : (
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const isSelected = selected.includes(item.id);
              const initials = item.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const hue = item.name.charCodeAt(0) * 37 % 360;
              return (
                <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => toggle(item.id)}>
                  <View style={[styles.avatar, { backgroundColor: `hsl(${hue},50%,45%)` }]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                  <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={54} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No contacts on Videh</Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                  Ask your contacts to join Videh, then refresh.
                </Text>
                <TouchableOpacity style={[styles.refreshBtn, { backgroundColor: colors.primary }]} onPress={loadGroupCandidates}>
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            }
          />
          )}
          {selected.length > 0 && (
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={proceed}>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.nameStep}>
          <TouchableOpacity style={[styles.avatarPicker, { borderColor: colors.border }]} onPress={pickGroupPhoto}>
            {groupAvatarUri ? (
              <Image source={{ uri: groupAvatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary + "22" }]}>
                <Ionicons name="camera" size={24} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>
          <TextInput
            style={[styles.nameInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.primary }]}
            placeholder="Group subject"
            placeholderTextColor={colors.mutedForeground}
            value={groupName}
            onChangeText={setGroupName}
            autoFocus
            maxLength={25}
          />
          <Text style={[styles.memberCount, { color: colors.mutedForeground }]}>
            {selected.length} participant{selected.length !== 1 ? "s" : ""}
          </Text>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }, !groupName.trim() && { opacity: 0.5 }]}
            onPress={create}
            disabled={!groupName.trim()}
          >
            <Text style={styles.createBtnText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12, gap: 12 },
  backBtn: { padding: 8 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular" },
  selectedBar: { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 6, borderBottomWidth: 0.5 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  chip: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chipText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  loaderWrap: { alignItems: "center", justifyContent: "center", marginTop: 60, gap: 10 },
  loaderText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: 80, gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  refreshBtn: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24 },
  refreshBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  name: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  nextBtn: { position: "absolute", bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  nameStep: { flex: 1, alignItems: "center", padding: 24, paddingTop: 40, gap: 20 },
  avatarPicker: { width: 92, height: 92, borderRadius: 46, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 92, height: 92 },
  avatarFallback: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center" },
  nameInput: { width: "100%", borderWidth: 2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  memberCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  createBtn: { marginTop: 20, width: "100%", paddingVertical: 16, borderRadius: 50, alignItems: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
