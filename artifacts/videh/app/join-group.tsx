import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  joinGroupViaInvite,
  parseGroupInviteTokenFromUrl,
  resolveGroupInvite,
} from "@/lib/groupInviteLinks";

export default function JoinGroupScreen() {
  const params = useLocalSearchParams<{ token?: string; url?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refreshChats } = useApp();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const raw =
      (params.token ? String(params.token) : null)
      ?? (params.url ? parseGroupInviteTokenFromUrl(String(params.url)) : null);
    if (!raw) {
      setLoading(false);
      return;
    }
    setToken(raw);
    void resolveGroupInvite(raw).then((info) => {
      if (!info) {
        Alert.alert("Invalid link", "This group invite link is invalid or expired.");
        router.back();
        return;
      }
      setGroupName(info.groupName);
      setMemberCount(info.memberCount);
      setLoading(false);
    });
  }, [params.token, params.url, router]);

  const onJoin = async () => {
    if (!token) return;
    if (!user?.sessionToken || !user.dbId) {
      Alert.alert("Sign in required", "Open Videh and sign in to join this group.");
      return;
    }
    setJoining(true);
    const result = await joinGroupViaInvite(token, user.sessionToken);
    setJoining(false);
    if (!result) {
      Alert.alert("Could not join", "This invite link may be invalid or you may not be allowed to join.");
      return;
    }
    await refreshChats();
    if (result.pendingApproval) {
      Alert.alert(
        "Waiting for approval",
        result.message ?? "An admin must approve you before you can send messages.",
        [{
          text: "Open group",
          onPress: () => {
            router.replace({
              pathname: "/chat/[id]",
              params: { id: result.chatId, name: result.groupName },
            });
          },
        }],
      );
      return;
    }
    router.replace({
      pathname: "/chat/[id]",
      params: { id: result.chatId, name: result.groupName },
    });
  };

  const onShare = () => {
    if (!token) return;
    void Share.share({
      message: `Join "${groupName}" on Videh: https://videh.co.in/join.html?t=${token}`,
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" />
      ) : (
        <>
          <Ionicons name="people-outline" size={48} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>Join group</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {groupName || "Videh group"}
            {memberCount > 0 ? ` · ${memberCount} members` : ""}
          </Text>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            After joining, an admin must approve you before you can send messages.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary, opacity: joining ? 0.7 : 1 }]}
            onPress={() => void onJoin()}
            disabled={joining}
          >
            <Text style={styles.btnTxt}>{joining ? "Joining…" : "Join group"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={onShare}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Share link again</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", paddingHorizontal: 28 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 16 },
  sub: { fontSize: 14, textAlign: "center", marginTop: 8 },
  note: { fontSize: 13, textAlign: "center", marginTop: 12, marginBottom: 24, lineHeight: 20 },
  btn: { width: "100%", borderRadius: 28, paddingVertical: 14, alignItems: "center" },
  btnTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkBtn: { marginTop: 16, padding: 12 },
});
