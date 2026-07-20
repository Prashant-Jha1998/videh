import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { replaceAfterAuth } from "@/lib/incomingShareRoute";
import { getApiUrl } from "@/lib/api";

export default function TwoStepLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone, dbId, ret, twoStepTicket } = useLocalSearchParams<{ phone: string; dbId: string; ret?: string; twoStepTicket?: string }>();
  const { setUser } = useApp();
  const { t } = useUiPreferences();

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lockSeconds, setLockSeconds] = useState(0);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const t = setTimeout(() => setLockSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockSeconds]);

  const submitIfComplete = useCallback(
    async (nextDigits: string[]) => {
      if (!nextDigits.every((d) => d !== "") || lockSeconds > 0) return;
      const pin = nextDigits.join("");
      const id = Number(dbId);
      if (!id || Number.isNaN(id)) return;
      const ticket = typeof twoStepTicket === "string" ? twoStepTicket : "";
      if (!ticket) {
        setError(t("auth.twoStepWrong"));
        return;
      }
      setLoading(true);
      setError("");
      try {
        const baseUrl = getApiUrl();
        const res = await fetch(`${baseUrl}/api/users/${id}/verify-two-step`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ticket}`,
          },
          body: JSON.stringify({ pin, twoStepTicket: ticket }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          noPin?: boolean;
          locked?: boolean;
          retryAfterSeconds?: number;
          name?: string | null;
          about?: string | null;
          avatarUrl?: string | null;
          sessionToken?: string;
          message?: string;
        };
        if (data.locked && data.retryAfterSeconds) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setLockSeconds(data.retryAfterSeconds);
          setError(data.message ?? t("auth.twoStepWrong"));
          setDigits(["", "", "", "", "", ""]);
          setLoading(false);
          return;
        }
        if (res.ok && data.success && data.sessionToken) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const isReturning = ret === "1";
          await setUser({
            id: Date.now().toString(),
            dbId: id,
            name: data.name ?? "",
            phone: phone ?? "",
            about: data.about ?? "Hey there! I am using Videh.",
            avatar: data.avatarUrl ?? undefined,
            sessionToken: data.sessionToken,
          });
          await replaceAfterAuth(
            router,
            (isReturning ? "/(tabs)/chats" : "/auth/profile") as import("expo-router").Href,
          );
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError(data.message ?? t("auth.twoStepWrong"));
          setDigits(["", "", "", "", "", ""]);
          inputs.current[0]?.focus();
        }
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(t("twoStep.errNetwork"));
        setDigits(["", "", "", "", "", ""]);
        inputs.current[0]?.focus();
      }
      setLoading(false);
    },
    [dbId, lockSeconds, phone, ret, router, twoStepTicket, setUser, t],
  );

  const handleChange = (text: string, idx: number) => {
    const onlyDigits = text.replace(/[^0-9]/g, "");
    if (onlyDigits.length > 1) {
      const newDigits = [...digits];
      let j = idx;
      for (const ch of onlyDigits) {
        if (j > 5) break;
        newDigits[j] = ch;
        j += 1;
      }
      setDigits(newDigits);
      setError("");
      if (j <= 5) inputs.current[j]?.focus();
      else void submitIfComplete(newDigits);
      return;
    }
    const digit = onlyDigits.slice(-1);
    const newDigits = [...digits];
    newDigits[idx] = digit;
    setDigits(newDigits);
    setError("");
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
    if (digit && idx === 5 && newDigits.every((d) => d !== "")) void submitIfComplete(newDigits);
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Ionicons name="keypad" size={40} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("auth.twoStepLoginTitle")}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t("auth.twoStepLoginHint")}
          {"\n"}
          <Text style={[styles.phone, { color: colors.foreground }]}>+91 {phone}</Text>
        </Text>

        <View style={styles.otpRow}>
          {digits.map((d, idx) => (
            <TextInput
              key={idx}
              ref={(r) => {
                inputs.current[idx] = r;
              }}
              style={[
                styles.otpBox,
                {
                  backgroundColor: colors.card,
                  borderColor: d ? colors.primary : colors.border,
                  color: colors.foreground,
                  borderWidth: d ? 2 : 1.5,
                },
                error ? { borderColor: colors.destructive } : {},
              ]}
              keyboardType="number-pad"
              maxLength={1}
              value={d}
              onChangeText={(txt) => handleChange(txt, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              editable={!loading && lockSeconds <= 0}
            />
          ))}
        </View>
        {error ? <Text style={[styles.err, { color: colors.destructive }]}>{error}</Text> : null}
        {lockSeconds > 0 ? (
          <Text style={[styles.err, { color: colors.destructive }]}>
            Locked for {Math.floor(lockSeconds / 60)}:{String(lockSeconds % 60).padStart(2, "0")}
          </Text>
        ) : null}
        {loading ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { position: "absolute", left: 16, top: 16, zIndex: 2, padding: 8 },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: "center" },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignSelf: "center", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 10 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  phone: { fontFamily: "Inter_600SemiBold" },
  otpRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  otpBox: { width: 46, height: 54, borderRadius: 12, textAlign: "center", fontSize: 22, fontFamily: "Inter_700Bold" },
  err: { marginTop: 14, textAlign: "center", fontSize: 14, fontFamily: "Inter_500Medium" },
});
