import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useApp } from "@/context/AppContext";
const API_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type Step = "phone" | "otp";

export default function ChangeNumberScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refreshUser } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [step, setStep] = useState<Step>("phone");
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    const cleaned = newPhone.replace(/\D/g, "");
    if (cleaned.length !== 10) { Alert.alert("Error", "10 digit ka valid mobile number daalo."); return; }
    if (cleaned === user?.phone) { Alert.alert("Error", "Yeh pehle se aapka number hai!"); return; }
    const existingCheck = await fetch(`${API_URL}/users/check-phone?phone=${cleaned}`);
    const ec = await existingCheck.json();
    if (ec.exists) { Alert.alert("Error", "Yeh number pehle se kisi aur account se linked hai."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned }),
      });
      const d = await r.json();
      if (d.success) { setStep("otp"); }
      else Alert.alert("Error", d.message ?? "OTP bhejne mein problem hui.");
    } catch { Alert.alert("Error", "Network error"); }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { Alert.alert("Error", "6 digit OTP daalo."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone.replace(/\D/g, ""), otp }),
      });
      const d = await r.json();
      if (d.success && d.user) {
        await fetch(`${API_URL}/users/${user?.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: newPhone.replace(/\D/g, "") }),
        });
        await refreshUser?.();
        Alert.alert("Ho gaya!", "Number successfully change ho gaya.", [{ text: "OK", onPress: () => router.replace("/(tabs)/settings") }]);
      } else Alert.alert("Error", "OTP galat hai ya expire ho gaya.");
    } catch { Alert.alert("Error", "Network error"); }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Number Change Karo</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {step === "phone" ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="phone-portrait-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Naya Number Daalo</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Naye number pe OTP bheja jaayega verify karne ke liye.
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.prefix, { color: colors.foreground }]}>+91</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Naya mobile number"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={10}
                value={newPhone}
                onChangeText={setNewPhone}
              />
            </View>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
              onPress={sendOtp}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? "Bhej raha hai..." : "OTP Bhejo"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="keypad-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>OTP Verify Karo</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              +91 {newPhone} pe 6-digit OTP bheja gaya hai.
            </Text>
            <TextInput
              style={[styles.otpInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              placeholder="000000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
            />
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
              onPress={verifyOtp}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? "Verify ho raha hai..." : "Verify Karo"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setStep("phone"); setOtp(""); }}>
              <Text style={[styles.back, { color: colors.primary }]}>Number wapas badle</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  body: { flex: 1, alignItems: "center", padding: 32, gap: 20 },
  iconCircle: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, gap: 8, width: "100%" },
  prefix: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  input: { flex: 1, paddingVertical: 14, fontSize: 18, fontFamily: "Inter_400Regular" },
  otpInput: { borderWidth: 1, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: 10, textAlign: "center", width: "100%" },
  btn: { width: "100%", paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  back: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },
});
