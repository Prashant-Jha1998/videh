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
import { joinCallLink, resolveCallLink } from "@/lib/callLinks";

export default function JoinCallScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [loading, setLoading] = useState(true);
  const [hostName, setHostName] = useState("");
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const [chatId, setChatId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void resolveCallLink(String(token), user?.sessionToken).then((info) => {
      if (!info) {
        Alert.alert("Invalid link", "This call link has expired.");
        router.back();
        return;
      }
      setHostName(info.hostName);
      setCallType(info.callType === "audio" ? "audio" : "video");
      setChatId(info.chatId ?? null);
      setLoading(false);
    });
  }, [token, user?.sessionToken, router]);

  const onJoin = async () => {
    if (!token || !user?.sessionToken) {
      Alert.alert("Sign in required", "Open Videh and sign in to join this call.");
      return;
    }
    setLoading(true);
    const joined = await joinCallLink(String(token), user.sessionToken);
    setLoading(false);
    if (!joined) {
      Alert.alert("Could not join", "Link may have expired.");
      return;
    }
    router.replace({
      pathname: "/call/[id]",
      params: {
        id: String(joined.chatId),
        name: hostName,
        type: joined.callType,
      },
    });
  };

  const onShare = () => {
    if (!token) return;
    void Share.share({
      message: `Join my Videh call: videh://join-call?token=${token}`,
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" />
      ) : (
        <>
          <Ionicons name="link-outline" size={48} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>Join Videh call</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {hostName ? `${hostName} invited you` : "Call link"} · {callType === "video" ? "Video" : "Voice"}
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => void onJoin()}>
            <Text style={styles.btnTxt}>Join call</Text>
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
  sub: { fontSize: 14, textAlign: "center", marginTop: 8, marginBottom: 28 },
  btn: { width: "100%", borderRadius: 28, paddingVertical: 14, alignItems: "center" },
  btnTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkBtn: { marginTop: 16, padding: 12 },
});
