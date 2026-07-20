import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SmsOtpBoxes } from "@/components/SmsOtpBoxes";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { replaceAfterAuth } from "@/lib/incomingShareRoute";
import { getApiUrl } from "@/lib/api";

export default function OtpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { setUser } = useApp();

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [error, setError] = useState("");
  const [lockSeconds, setLockSeconds] = useState(0);
  const autoSubmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const t = setTimeout(() => setLockSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockSeconds]);

  const handleVerify = useCallback(async (code?: string) => {
    const enteredOtp = code ?? digits.join("");
    if (enteredOtp.length !== 6 || lockSeconds > 0) return;
    if (autoSubmittedRef.current === enteredOtp || loading) return;
    autoSubmittedRef.current = enteredOtp;
    setLoading(true);

    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/api/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: enteredOtp }),
      });
      const data = await res.json() as {
        success: boolean; message?: string;
        locked?: boolean;
        retryAfterSeconds?: number;
        attemptsRemaining?: number;
        dbId?: number; isNew?: boolean;
        twoStepRequired?: boolean;
        sessionToken?: string;
        twoStepTicket?: string;
        name?: string | null; about?: string | null; avatarUrl?: string | null;
      };

      if (data.locked && data.retryAfterSeconds) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLockSeconds(data.retryAfterSeconds);
        setError(data.message ?? "Too many wrong attempts. Please wait.");
        autoSubmittedRef.current = null;
        setDigits(["", "", "", "", "", ""]);
        setLoading(false);
        return;
      }

      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (data.twoStepRequired && data.dbId != null) {
          const isReturning = !data.isNew && data.name;
          router.replace({
            pathname: "/auth/two-step-login",
            params: {
              phone: phone ?? "",
              dbId: String(data.dbId),
              ret: isReturning ? "1" : "0",
              twoStepTicket: data.twoStepTicket ?? "",
            },
          } as unknown as Href);
          setLoading(false);
          return;
        }
        const isReturning = !data.isNew && data.name;
        await setUser({
          id: Date.now().toString(),
          dbId: data.dbId,
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
        setError(data.message ?? "Incorrect OTP. Please try again.");
        autoSubmittedRef.current = null;
        setDigits(["", "", "", "", "", ""]);
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Could not verify OTP. Check your connection.");
      autoSubmittedRef.current = null;
      setDigits(["", "", "", "", "", ""]);
    }

    setLoading(false);
  }, [digits, loading, lockSeconds, phone, router, setUser]);

  const resend = async () => {
    if (lockSeconds > 0) return;
    setResendTimer(30);
    autoSubmittedRef.current = null;
    setDigits(["", "", "", "", "", ""]);
    setError("");
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}/api/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json() as { success?: boolean; locked?: boolean; retryAfterSeconds?: number; message?: string };
      if (data.locked && data.retryAfterSeconds) {
        setLockSeconds(data.retryAfterSeconds);
        setError(data.message ?? "Too many wrong attempts. Please wait.");
        return;
      }
      if (!data.success) {
        setError(data.message ?? "Could not resend OTP.");
        return;
      }
    } catch {
      setError("Could not resend OTP. Check your connection.");
      return;
    }
    Alert.alert("OTP Resent", `A new OTP has been sent to +91 ${phone}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.logoWrap}>
          <Image
            source={require("@/assets/images/videh_icon_foreground.png")}
            style={[styles.logo, { tintColor: colors.primary }]}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Verify OTP</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Enter the 6-digit code sent to{"\n"}
          <Text style={[styles.phone, { color: colors.foreground }]}>+91 {phone}</Text>
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Tip: on supported phones, OTP from SMS can autofill here.
        </Text>

        <SmsOtpBoxes
          digits={digits}
          onDigitsChange={(next) => {
            setDigits(next);
            setError("");
          }}
          onComplete={(code) => void handleVerify(code)}
          editable={!loading && lockSeconds <= 0}
          error={!!error}
          filledBorderColor={colors.primary}
          emptyBorderColor={colors.border}
          backgroundColor={colors.card}
          textColor={colors.foreground}
          errorBorderColor={colors.destructive}
        />

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {lockSeconds > 0 ? (
          <Text style={[styles.error, { color: colors.destructive }]}>
            Locked for {Math.floor(lockSeconds / 60)}:{String(lockSeconds % 60).padStart(2, "0")}. Wrong OTPs cannot be retried until unlock.
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity
            style={[styles.verifyBtn, { backgroundColor: colors.primary }, digits.join("").length !== 6 && { opacity: 0.5 }]}
            onPress={() => handleVerify()}
            disabled={digits.join("").length !== 6 || lockSeconds > 0}
          >
            <Text style={styles.verifyText}>Verify & Continue</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={resend} disabled={resendTimer > 0 || lockSeconds > 0} style={{ marginTop: 20 }}>
          <Text style={[styles.resend, { color: resendTimer > 0 || lockSeconds > 0 ? colors.mutedForeground : colors.primary }]}>
            {lockSeconds > 0
              ? "Resend available after unlock"
              : resendTimer > 0
                ? `Resend OTP in ${resendTimer}s`
                : "Resend OTP"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { padding: 20 },
  content: { flex: 1, alignItems: "center", paddingHorizontal: 24 },
  logoWrap: { width: 92, height: 92, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  logo: { width: 72, height: 72 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 10 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 24 },
  phone: { fontFamily: "Inter_600SemiBold" },
  error: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 16, marginBottom: 8, textAlign: "center" },
  verifyBtn: { width: "100%", paddingVertical: 16, borderRadius: 50, alignItems: "center", marginTop: 8 },
  verifyText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  resend: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
