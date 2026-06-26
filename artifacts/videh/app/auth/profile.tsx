import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { registerPushTokenWithServer } from "@/lib/pushNotifications";
import {
  clearProfileSetupDraft,
  loadProfileSetupDraft,
  saveProfileSetupDraft,
} from "@/lib/profileSetupDraft";
import { checkReelsHandle, createReelsChannel, REELS_HANDLE_RE } from "@/lib/reelsApi";

function normalizeReelsHandleInput(value: string): string {
  return value.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
}

export default function ProfileSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, updateAvatar } = useApp();

  const [name, setName] = useState(user?.name ?? "");
  const [reelsHandle, setReelsHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleOk, setHandleOk] = useState(false);
  const [about, setAbout] = useState(user?.about ?? "Hey there! I am using Videh.");
  const [avatarUri, setAvatarUri] = useState<string | undefined>(user?.avatar);
  const [loading, setLoading] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [aboutFocused, setAboutFocused] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  const reelsHandleRef = useRef(reelsHandle);
  reelsHandleRef.current = reelsHandle;
  const handleCheckSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadProfileSetupDraft(user?.dbId);
      if (cancelled) return;
      if (draft) {
        if (draft.name.trim()) setName(draft.name);
        if (draft.reelsHandle.trim()) setReelsHandle(normalizeReelsHandleInput(draft.reelsHandle));
        if (draft.about.trim()) setAbout(draft.about);
      }
      setDraftReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.dbId]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(() => {
      void saveProfileSetupDraft(
        { name, reelsHandle, about },
        user?.dbId,
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [name, reelsHandle, about, draftReady, user?.dbId]);

  const isValid = name.trim().length >= 2 && REELS_HANDLE_RE.test(reelsHandle.trim()) && handleOk;

  React.useEffect(() => {
    const h = reelsHandle.trim().replace(/^@/, "");
    if (!REELS_HANDLE_RE.test(h)) {
      setHandleOk(false);
      setHandleError(h.length > 0 ? "Username: 3–30 letters, numbers, underscore. Must start with a letter." : null);
      return;
    }
    const seq = ++handleCheckSeqRef.current;
    const t = setTimeout(() => {
      void checkReelsHandle(h, user?.sessionToken).then((res) => {
        if (seq !== handleCheckSeqRef.current) return;
        if (reelsHandleRef.current.trim().replace(/^@/, "") !== h) return;
        if (!res.success) {
          setHandleOk(false);
          setHandleError(res.message ?? "Could not verify username");
          return;
        }
        setHandleOk(Boolean(res.available));
        setHandleError(res.available ? null : "Username already used");
      });
    }, 450);
    return () => clearTimeout(t);
  }, [reelsHandle, user?.sessionToken]);

  const pickFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow photo library access in your device settings.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAvatarUri(asset.uri);
        if (asset.base64) {
          await updateAvatar(asset.base64, "image/jpeg");
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err) {
      Alert.alert("Error", "Could not open photo library.");
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow camera access in your device settings.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAvatarUri(asset.uri);
        if (asset.base64) {
          await updateAvatar(asset.base64, "image/jpeg");
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err) {
      Alert.alert("Error", "Could not open camera.");
    }
  };

  const showPhotoOptions = () => {
    Alert.alert(
      "Profile Photo",
      "Choose how to set your profile photo",
      [
        { text: "📷 Take Photo", onPress: takePhoto },
        { text: "🖼 Choose from Library", onPress: pickFromLibrary },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const save = async () => {
    if (!isValid || !user) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setUser({
      ...user,
      name: name.trim(),
      about: about.trim(),
      avatar: user.avatar ?? avatarUri,
    });
    if (user.dbId) {
      const ch = await createReelsChannel(
        user.dbId,
        reelsHandle.trim(),
        user.avatar ?? avatarUri ?? null,
        user.sessionToken,
      );
      if (!ch.success) {
        setLoading(false);
        Alert.alert("Reels username", ch.message ?? "Username already used.");
        return;
      }
      await clearProfileSetupDraft();
      try {
        await registerPushTokenWithServer(user.dbId);
      } catch {
        // permission denied — user can enable later in settings
      }
    }
    setLoading(false);
    router.replace("/(tabs)/chats");
  };

  const initials = name.trim()
    ? name.trim().split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40), paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={Platform.OS === "ios" ? 20 : 12}
    >
        {/* Page Header */}
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>Profile Info</Text>
        <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
          Set your name and profile photo so your contacts can recognise you
        </Text>

        {/* Avatar picker */}
        <TouchableOpacity style={styles.avatarWrap} onPress={showPhotoOptions} activeOpacity={0.8}>
          {avatarUri || user?.avatar ? (
            <Image source={{ uri: avatarUri ?? user?.avatar }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          {/* Name overlay */}
          {name.trim().length > 0 && (
            <View style={styles.avatarNameBar}>
              <Text style={styles.avatarNameText} numberOfLines={1}>{name.trim()}</Text>
            </View>
          )}
          <View style={[styles.cameraCircle, { backgroundColor: colors.primary }]}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Form Card */}
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Name Field */}
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Your Name *</Text>
            <TextInput
              style={[
                styles.fieldInput,
                { color: colors.foreground, borderBottomColor: nameFocused ? colors.primary : "transparent" }
              ]}
              placeholder="Enter your full name"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              maxLength={25}
              autoFocus={Platform.OS !== "android"}
              returnKeyType="next"
              blurOnSubmit={false}
              autoComplete="name"
              textContentType="name"
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{name.length}/25</Text>
          </View>

          {/* Reels @username */}
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Reels @username *</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: colors.primary, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>@</Text>
              <TextInput
                style={[styles.fieldInput, { flex: 1, color: colors.foreground }]}
                placeholder="yourchannel"
                placeholderTextColor={colors.mutedForeground}
                value={reelsHandle}
                onChangeText={(t) => setReelsHandle(normalizeReelsHandleInput(t))}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                maxLength={30}
              />
            </View>
            {handleError ? (
              <Text style={{ color: "#e53e3e", fontSize: 12, marginTop: 4 }}>{handleError}</Text>
            ) : handleOk ? (
              <Text style={{ color: colors.primary, fontSize: 12, marginTop: 4 }}>Username available</Text>
            ) : null}
          </View>

          {/* About Field */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>About</Text>
            <TextInput
              style={[
                styles.fieldInput,
                { color: colors.foreground, borderBottomColor: aboutFocused ? colors.primary : "transparent" }
              ]}
              placeholder="Hey there! I am using Videh."
              placeholderTextColor={colors.mutedForeground}
              value={about}
              onChangeText={setAbout}
              onFocus={() => setAboutFocused(true)}
              onBlur={() => setAboutFocused(false)}
              maxLength={140}
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{about.length}/140</Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: isValid ? colors.primary : colors.muted },
            !isValid && { opacity: 0.5 },
          ]}
          onPress={save}
          disabled={!isValid || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.saveBtnText}>Save & Continue</Text>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.helpText, { color: colors.mutedForeground }]}>
          Your profile name is visible to all Videh users who have your number.
        </Text>
    </KeyboardAwareScrollViewCompat>
  );
}

const AVATAR_SIZE = 120;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: "center", paddingHorizontal: 24 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  pageSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 32 },

  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginBottom: 32,
    position: "relative",
    overflow: "visible",
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarInitials: { color: "#fff", fontSize: 42, fontFamily: "Inter_700Bold" },
  avatarNameBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 5,
    alignItems: "center",
    borderBottomLeftRadius: AVATAR_SIZE / 2,
    borderBottomRightRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
  },
  avatarNameText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cameraCircle: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 10,
  },

  formCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 28,
  },
  field: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  fieldInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    paddingVertical: 4,
    borderBottomWidth: 1.5,
    paddingBottom: 8,
  },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 4 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 50,
    marginBottom: 16,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  helpText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
