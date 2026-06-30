import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchGroupPermissions,
  updateGroupPermissions,
  type GroupPermissions,
} from "@/lib/groupPermissions";
import { normalizeRouteParam } from "@/lib/routeParams";

type PermKey = keyof GroupPermissions;

type PermRowDef = {
  key: PermKey;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  label: string;
  description?: string;
};

const MEMBER_ROWS: PermRowDef[] = [
  {
    key: "membersCanEditInfo",
    icon: "create-outline",
    iconBg: "#5C6BC0",
    label: "Edit group settings",
    description:
      "This includes the name, icon, description, disappearing message timer, and the ability to pin, keep or unkeep messages.",
  },
  {
    key: "membersCanSendMessages",
    icon: "chatbox-outline",
    iconBg: "#00897B",
    label: "Send new messages",
  },
  {
    key: "membersCanAddMembers",
    icon: "person-add-outline",
    iconBg: "#7E57C2",
    label: "Add other members",
  },
  {
    key: "membersCanShareHistory",
    icon: "time-outline",
    iconBg: "#26A69A",
    label: "Send message history",
    description: "Allow members to send past messages to new members.",
  },
  {
    key: "membersCanInviteViaLink",
    icon: "link-outline",
    iconBg: "#42A5F5",
    label: "Invite via link or QR code",
  },
];

const ADMIN_ROWS: PermRowDef[] = [
  {
    key: "approveNewMembers",
    icon: "person-outline",
    iconBg: "#FF7043",
    label: "Approve new members",
    description:
      "When turned on, admins must approve anyone who wants to join the group via invite link.",
  },
];

function PermRow({
  row,
  value,
  editable,
  saving,
  onToggle,
  colors,
  last,
}: {
  row: PermRowDef;
  value: boolean;
  editable: boolean;
  saving: boolean;
  onToggle: (key: PermKey, next: boolean) => void;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.iconWrap, { backgroundColor: row.iconBg }]}>
        <Ionicons name={row.icon} size={18} color="#fff" />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{row.label}</Text>
        {row.description ? (
          <Text style={[styles.rowDesc, { color: colors.mutedForeground }]}>{row.description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => onToggle(row.key, next)}
        disabled={!editable || saving}
        thumbColor={value ? colors.primary : "#f4f3f4"}
        trackColor={{ true: colors.primary + "80", false: colors.border }}
      />
    </View>
  );
}

export default function GroupPermissionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = normalizeRouteParam(rawId);
  const { user } = useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("Group");
  const [isAdmin, setIsAdmin] = useState(false);
  const [perms, setPerms] = useState<GroupPermissions | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const load = useCallback(async () => {
    if (!id || !user?.dbId) return;
    setLoading(true);
    const data = await fetchGroupPermissions(id, user.dbId, user.sessionToken);
    if (data) {
      setGroupName(data.groupName);
      setIsAdmin(data.isAdmin);
      setPerms(data.permissions);
    } else {
      Alert.alert("Error", "Could not load group permissions.");
    }
    setLoading(false);
  }, [id, user?.dbId, user?.sessionToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (key: PermKey, next: boolean) => {
    if (!id || !user?.dbId || !perms || !isAdmin || saving) return;
    const prev = perms[key];
    setPerms({ ...perms, [key]: next });
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await updateGroupPermissions(
      id,
      user.dbId,
      { [key]: next },
      user.sessionToken,
    );
    setSaving(false);
    if (updated) {
      setPerms(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setPerms({ ...perms, [key]: prev });
      Alert.alert("Could not update", "Only admins can change group permissions.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Group permissions</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {groupName}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading || !perms ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Members can:</Text>
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            {MEMBER_ROWS.map((row, i) => (
              <PermRow
                key={row.key}
                row={row}
                value={perms[row.key]}
                editable={isAdmin}
                saving={saving}
                onToggle={(k, v) => { void toggle(k, v); }}
                colors={colors}
                last={i === MEMBER_ROWS.length - 1}
              />
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Admins can:</Text>
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            {ADMIN_ROWS.map((row, i) => (
              <PermRow
                key={row.key}
                row={row}
                value={perms[row.key]}
                editable={isAdmin}
                saving={saving}
                onToggle={(k, v) => { void toggle(k, v); }}
                colors={colors}
                last={i === ADMIN_ROWS.length - 1}
              />
            ))}
          </View>

          {!isAdmin ? (
            <Text style={[styles.readOnlyHint, { color: colors.mutedForeground }]}>
              Only group admins can change these settings.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2, maxWidth: "90%" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 16,
    marginBottom: 6,
    marginHorizontal: 16,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  section: {
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowDesc: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  readOnlyHint: {
    textAlign: "center",
    fontSize: 13,
    marginTop: 20,
    paddingHorizontal: 24,
  },
});
