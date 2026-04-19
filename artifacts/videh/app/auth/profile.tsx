import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

export default function ProfileSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser } = useApp();

  const [name, setName] = useState(user?.name ?? "");
  const [about, setAbout] = useState(user?.about ?? "Hey there! I am using Videh.");
  const [loading, setLoading] = useState(false);

  const isValid = name.trim().length >= 2;

  const save = async () => {
    if (!isValid || !user) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setUser({ ...user, name: name.trim(), about: about.trim() });
    setLoading(false);
    router.replace("/(tabs)/chats");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24), paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Profile Info</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Please provide your name and an optional profile photo
        </Text>

        <TouchableOpacity style={[styles.avatar, { backgroundColor: colors.muted }]} activeOpacity={0.8}>
          <Ionicons name="person" size={48} color={colors.mutedForeground} />
          <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={{ width: "100%", gap: 20 }}>
          <View>
            <Text style={[styles.label, { color: colors.primary }]}>Your Name</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="Enter your name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              maxLength={25}
              autoFocus
            />
          </View>

          <View>
            <Text style={[styles.label, { color: colors.primary }]}>About</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="About (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={about}
              onChangeText={setAbout}
              maxLength={140}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: isValid ? colors.primary : colors.muted }, !isValid && { opacity: 0.5 }]}
          onPress={save}
          disabled={!isValid || loading}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Let's Go</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: "center", paddingHorizontal: 24 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 8 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 32 },
  avatar: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  cameraBtn: { position: "absolute", bottom: 4, right: 4, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  input: { width: "100%", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular" },
  btn: { marginTop: 40, width: "100%", paddingVertical: 16, borderRadius: 50, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
