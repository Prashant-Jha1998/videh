import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);
  const [loading, setLoading] = useState(false);

  const isValid = name.trim().length >= 2;

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow access to your photo library to set a profile photo.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatar(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access to take a profile photo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatar(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const showImageOptions = () => {
    Alert.alert("Profile Photo", "Choose how to set your profile photo", [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: pickImage },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const save = async () => {
    if (!isValid || !user) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setUser({ ...user, name: name.trim(), about: about.trim(), avatar });
    setLoading(false);
    router.replace("/(tabs)/chats");
  };

  const initials = name.trim()
    ? name.trim().split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

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

        {/* Avatar with name overlay — like WhatsApp */}
        <TouchableOpacity style={styles.avatarWrapper} onPress={showImageOptions} activeOpacity={0.85}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          {/* Name overlay at bottom of avatar */}
          {name.trim().length > 0 && (
            <View style={styles.nameOverlay}>
              <Text style={styles.nameOverlayText} numberOfLines={1}>{name.trim()}</Text>
            </View>
          )}
          {/* Camera icon */}
          <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="camera" size={18} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={{ width: "100%", gap: 0, marginTop: 8 }}>
          {/* Name field */}
          <View style={[styles.inputGroup, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Your name</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              placeholder="Enter your name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              maxLength={25}
              autoFocus
            />
          </View>

          {/* About field */}
          <View style={[styles.inputGroup, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>About</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground }]}
              placeholder="Hey there! I am using Videh."
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
  avatarWrapper: {
    width: 130,
    height: 130,
    borderRadius: 65,
    marginBottom: 28,
    overflow: "hidden",
    position: "relative",
  },
  avatarImage: { width: 130, height: 130, borderRadius: 65 },
  avatarPlaceholder: { width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center" },
  avatarInitials: { color: "#fff", fontSize: 44, fontFamily: "Inter_700Bold" },
  nameOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 6,
    alignItems: "center",
  },
  nameOverlayText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  inputGroup: {
    width: "100%",
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  fieldInput: { fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 2 },
  btn: { marginTop: 40, width: "100%", paddingVertical: 16, borderRadius: 50, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
