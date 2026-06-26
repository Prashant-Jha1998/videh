import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { checkReelsHandle, createReelsChannel, REELS_HANDLE_RE } from "@/lib/reelsApi";

export default function ReelsSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [handle, setHandle] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const handleRef = useRef(handle);
  handleRef.current = handle;
  const checkSeqRef = useRef(0);

  useEffect(() => {
    const h = handle.trim().replace(/^@/, "");
    if (!REELS_HANDLE_RE.test(h)) {
      setAvailable(null);
      setChecking(false);
      setError(h.length > 0 ? "Use 3–30 letters, numbers, underscore. Must start with a letter." : null);
      return;
    }
    setChecking(true);
    const seq = ++checkSeqRef.current;
    const t = setTimeout(() => {
      void checkReelsHandle(h, user?.sessionToken).then((res) => {
        if (seq !== checkSeqRef.current) return;
        if (handleRef.current.trim().replace(/^@/, "") !== h) return;
        setChecking(false);
        if (!res.success) {
          setAvailable(false);
          setError(res.message ?? "Could not check username");
          return;
        }
        setAvailable(res.available ?? false);
        setError(res.available ? null : "Username already used");
      });
    }, 450);
    return () => clearTimeout(t);
  }, [handle, user?.sessionToken]);

  const save = async () => {
    const h = handle.trim().replace(/^@/, "");
    if (!user?.dbId || !REELS_HANDLE_RE.test(h) || !available) return;
    setLoading(true);
    const res = await createReelsChannel(user.dbId, h, user.avatar ?? null, user.sessionToken);
    setLoading(false);
    if (!res.success) {
      setError(res.message ?? "Could not create channel");
      return;
    }
    router.replace("/reels/upload" as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>Reels account</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Pick a unique @username for your video channel
      </Text>

      <View style={[styles.field, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.prefix, { color: colors.primary }]}>@</Text>
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder="yourname"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          value={handle}
          onChangeText={(t) => setHandle(t.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30))}
          maxLength={30}
        />
        {checking ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        {!checking && available === true ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
        ) : null}
      </View>

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.primary, opacity: available && !loading ? 1 : 0.5 }]}
        disabled={!available || loading}
        onPress={save}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create channel</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  back: { marginBottom: 16 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 14, marginTop: 8, marginBottom: 24, lineHeight: 20 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  prefix: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  err: { color: "#e53e3e", marginTop: 8, fontSize: 13 },
  btn: { marginTop: 28, paddingVertical: 16, borderRadius: 28, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
