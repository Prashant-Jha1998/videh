import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { getApiUrl } from "@/lib/api";
const API_URL = `${getApiUrl()}/api`;

type Step = "check" | "enter" | "confirm" | "disable";

export default function TwoStepScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [step, setStep] = useState<Step>("check");
  const [isEnabled, setIsEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkPin, setCheckPin] = useState("");

  useEffect(() => {
    const checkStatus = async () => {
      if (!user) return;
      try {
        const r = await fetch(`${API_URL}/users/${user.dbId}/two-step-status`);
        const d = await r.json();
        if (d.success) { setIsEnabled(d.enabled); setStep(d.enabled ? "disable" : "enter"); }
      } catch {}
    };
    checkStatus();
  }, [user]);

  const setNewPin = async () => {
    if (pin.length !== 6) { Alert.alert("Error", "6 digit PIN daalo."); return; }
    if (pin !== confirmPin) { Alert.alert("Error", "Both PIN entries must match."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/users/${user?.dbId}/two-step-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json();
      if (d.success) {
        Alert.alert("Ho gaya!", "Two-step verification ON ho gaya.", [{ text: "OK", onPress: () => router.back() }]);
      } else Alert.alert("Error", d.message ?? "Something went wrong");
    } catch { Alert.alert("Error", "Network error"); }
    setLoading(false);
  };

  const disablePin = async () => {
    if (checkPin.length !== 6) { Alert.alert("Error", "Current PIN daalo."); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/users/${user?.dbId}/two-step-pin`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: checkPin }),
      });
      const d = await r.json();
      if (d.success) {
        Alert.alert("Disable ho gaya!", "Two-step verification band ho gaya.", [{ text: "OK", onPress: () => router.back() }]);
      } else Alert.alert("Error", "PIN galat hai.");
    } catch { Alert.alert("Error", "Network error"); }
    setLoading(false);
  };

  const renderEnableFlow = () => (
    <>
      {step === "enter" ? (
        <>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="lock-closed" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Naya PIN Set Karo</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Set a 6-digit PIN. This PIN will be required whenever Videh is re-registered.
          </Text>
          <TextInput
            style={[styles.pinInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            placeholder="● ● ● ● ● ●"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            value={pin}
            onChangeText={setPin}
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={() => { if (pin.length === 6) setStep("confirm"); else Alert.alert("Error", "6 digit PIN daalo"); }}
          >
            <Text style={styles.btnText}>Aage Badho</Text>
          </TouchableOpacity>
        </>
      ) : step === "confirm" ? (
        <>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + "20" }]}>
            <Ionicons name="shield-checkmark" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>PIN Confirm Karo</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Ek baar aur wahi PIN daalo confirm karne ke liye.
          </Text>
          <TextInput
            style={[styles.pinInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
            placeholder="● ● ● ● ● ●"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            value={confirmPin}
            onChangeText={setConfirmPin}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
            onPress={setNewPin}
            disabled={loading}
          >
            <Text style={styles.btnText}>{loading ? "Set ho raha hai..." : "PIN Set Karo"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setStep("enter"); setConfirmPin(""); }}>
            <Text style={[styles.back, { color: colors.primary }]}>PIN badlo</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </>
  );

  const renderDisableFlow = () => (
    <>
      <View style={[styles.iconCircle, { backgroundColor: "#4CAF50" + "20" }]}>
        <Ionicons name="shield-checkmark" size={40} color="#4CAF50" />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Two-Step Verification ON hai</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Aapka account 6-digit PIN se protected hai. Disable karne ke liye current PIN daalo.
      </Text>
      <TextInput
        style={[styles.pinInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
        placeholder="Current PIN"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        value={checkPin}
        onChangeText={setCheckPin}
      />
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.destructive, opacity: loading ? 0.7 : 1 }]}
        onPress={disablePin}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? "Disable ho raha hai..." : "Two-Step Disable Karo"}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Two-Step Verification</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.body}>
        {isEnabled ? renderDisableFlow() : renderEnableFlow()}
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
  pinInput: { borderWidth: 1, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: 14, textAlign: "center", width: "100%" },
  btn: { width: "100%", paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  back: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },
});
