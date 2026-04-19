import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
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

export default function NewGroupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { contacts, createGroup } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [step, setStep] = useState<"select" | "name">("select");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const proceed = () => {
    if (selected.length < 1) {
      Alert.alert("Select at least 1 contact");
      return;
    }
    setStep("name");
  };

  const create = () => {
    if (!groupName.trim()) { Alert.alert("Enter a group name"); return; }
    createGroup(groupName.trim(), selected);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)/chats");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => step === "name" ? setStep("select") : router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{step === "select" ? "New group" : "Group name"}</Text>
          {step === "select" && <Text style={styles.headerSub}>Add participants</Text>}
        </View>
      </View>

      {step === "select" ? (
        <>
          {selected.length > 0 && (
            <View style={[styles.selectedBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              {selected.map((id) => {
                const c = contacts.find((cc) => cc.id === id);
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
          <FlatList
            data={contacts.filter((c) => c.isOnVideh)}
            keyExtractor={(item) => item.id}
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
          />
          {selected.length > 0 && (
            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={proceed}>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.nameStep}>
          <TextInput
            style={[styles.nameInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.primary }]}
            placeholder="Group name"
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
  chip: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chipText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  name: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  nextBtn: { position: "absolute", bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  nameStep: { flex: 1, alignItems: "center", padding: 24, paddingTop: 40, gap: 20 },
  nameInput: { width: "100%", borderWidth: 2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  memberCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  createBtn: { marginTop: 20, width: "100%", paddingVertical: 16, borderRadius: 50, alignItems: "center" },
  createBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
