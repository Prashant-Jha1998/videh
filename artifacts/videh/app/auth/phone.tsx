import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const COUNTRY_CODE = "+91";

function generateOtp(): string {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  (global as any).__videhOtp = otp;
  return otp;
}

export default function PhoneScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = phone.length === 10 && /^\d+$/.test(phone);

  const sendOtp = async () => {
    if (!isValid) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const otp = generateOtp();

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const res = await fetch(`${baseUrl}/api/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json() as { success: boolean; message?: string };
      if (data.success) {
        Alert.alert("OTP Sent", `A 6-digit OTP has been sent to +91 ${phone}`);
      }
    } catch {
      // Proceed anyway — OTP stored locally for demo
    }

    setLoading(false);
    router.push({ pathname: "/auth/otp", params: { phone, otp } });
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 20);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.inner, { paddingTop: topPad, paddingBottom: insets.bottom + 20 }]}>
        <Image
          source={require("@/assets/images/videh_logo.png")}
          style={styles.logo}
          resizeMode="contain"
          tintColor={colors.primary}
        />
        <Text style={[styles.title, { color: colors.primary }]}>Videh</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Enter your mobile number to get started
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Enter your phone number</Text>
          <View style={[styles.inputRow, { borderColor: phone.length > 0 ? colors.primary : colors.border, borderWidth: 1.5, borderRadius: 12 }]}>
            <View style={[styles.countryCode, { borderRightColor: colors.border, borderRightWidth: 1.5 }]}>
              <Text style={[styles.countryText, { color: colors.foreground }]}>{COUNTRY_CODE}</Text>
            </View>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Mobile Number"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
              autoFocus
            />
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Videh will send a 6-digit OTP to verify your number
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: isValid ? colors.primary : colors.muted },
            !isValid && { opacity: 0.5 },
          ]}
          onPress={sendOtp}
          disabled={!isValid || loading}
          activeOpacity={0.8}
          testID="send-otp-btn"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={[styles.buttonText, { color: isValid ? "#fff" : colors.mutedForeground }]}>Send OTP</Text>
              <Ionicons name="arrow-forward" size={20} color={isValid ? "#fff" : colors.mutedForeground} />
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          By continuing, you agree to our{" "}
          <Text style={{ color: colors.primary }}>Terms of Service</Text>
          {" "}and{" "}
          <Text style={{ color: colors.primary }}>Privacy Policy</Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, alignItems: "center", paddingHorizontal: 24 },
  logo: { width: 80, height: 80, marginBottom: 12 },
  title: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8, marginBottom: 32 },
  card: { width: "100%", borderRadius: 16, padding: 20, marginBottom: 24 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", overflow: "hidden" },
  countryCode: { paddingHorizontal: 14, paddingVertical: 14 },
  countryText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  input: { flex: 1, fontSize: 17, fontFamily: "Inter_400Regular", paddingVertical: 14, paddingHorizontal: 14 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 12, textAlign: "center" },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 50, width: "100%", marginBottom: 24 },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  terms: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
