import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const handleChange = (text: string, idx: number) => {
    const digit = text.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[idx] = digit;
    setDigits(newDigits);
    setError("");
    if (digit && idx < 5) {
      inputs.current[idx + 1]?.focus();
    }
    if (newDigits.every((d) => d !== "")) {
      handleVerify(newDigits.join(""));
    }
  };

  const handleKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = useCallback(async (code?: string) => {
    const enteredOtp = code ?? digits.join("");
    if (enteredOtp.length !== 6) return;
    setLoading(true);

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const res = await fetch(`${baseUrl}/api/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: enteredOtp }),
      });
      const data = await res.json() as { success: boolean; message?: string };

      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await setUser({
          id: Date.now().toString(),
          name: "",
          phone: phone ?? "",
          about: "Hey there! I am using Videh.",
        });
        router.replace("/auth/profile");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(data.message ?? "Incorrect OTP. Please try again.");
        setDigits(["", "", "", "", "", ""]);
        inputs.current[0]?.focus();
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError("Could not verify OTP. Check your connection.");
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    }

    setLoading(false);
  }, [digits, phone]);

  const resend = async () => {
    setResendTimer(30);
    setDigits(["", "", "", "", "", ""]);
    setError("");
    inputs.current[0]?.focus();
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      await fetch(`${baseUrl}/api/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
    } catch {}
    Alert.alert("OTP Resent", `A new OTP has been sent to +91 ${phone}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Ionicons name="shield-checkmark" size={40} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Verify OTP</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Enter the 6-digit code sent to{"\n"}
          <Text style={[styles.phone, { color: colors.foreground }]}>+91 {phone}</Text>
        </Text>

        <View style={styles.otpRow}>
          {digits.map((d, idx) => (
            <TextInput
              key={idx}
              ref={(r) => { inputs.current[idx] = r; }}
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
              maxLength={1}
              keyboardType="number-pad"
              value={d}
              onChangeText={(t) => handleChange(t, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              autoFocus={idx === 0}
              selectTextOnFocus
            />
          ))}
        </View>

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity
            style={[styles.verifyBtn, { backgroundColor: colors.primary }, digits.join("").length !== 6 && { opacity: 0.5 }]}
            onPress={() => handleVerify()}
            disabled={digits.join("").length !== 6}
          >
            <Text style={styles.verifyText}>Verify & Continue</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={resend} disabled={resendTimer > 0} style={{ marginTop: 20 }}>
          <Text style={[styles.resend, { color: resendTimer > 0 ? colors.mutedForeground : colors.primary }]}>
            {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : "Resend OTP"}
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
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 10 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 32 },
  phone: { fontFamily: "Inter_600SemiBold" },
  otpRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  otpBox: { width: 48, height: 56, borderRadius: 12, fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  error: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16, textAlign: "center" },
  verifyBtn: { width: "100%", paddingVertical: 16, borderRadius: 50, alignItems: "center", marginTop: 8 },
  verifyText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  resend: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
