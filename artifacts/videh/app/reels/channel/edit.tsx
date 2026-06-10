import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  CHANNEL_AVATAR_ASPECT,
  CHANNEL_AVATAR_HINT,
  CHANNEL_COVER_ASPECT,
  CHANNEL_COVER_HINT,
  fetchMyReelsChannel,
  prepareChannelAvatar,
  prepareChannelCover,
  updateChannelLinks,
  updateChannelProfile,
} from "@/lib/reelsApi";
import type { ReelsChannelLink } from "@/lib/reelsApi";

export default function ReelsChannelEditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null);
  const [existingCover, setExistingCover] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preparingAvatar, setPreparingAvatar] = useState(false);
  const [preparingCover, setPreparingCover] = useState(false);
  const [links, setLinks] = useState<{ title: string; url: string }[]>([]);
  const [savingLinks, setSavingLinks] = useState(false);

  useEffect(() => {
    if (!user?.dbId) return;
    void fetchMyReelsChannel(user.dbId, user.sessionToken).then((res) => {
      if (!res.channel) {
        router.replace("/reels/setup");
        return;
      }
      setHandle(res.channel.handle);
      setDisplayName(
        res.channel.displayName?.startsWith("@")
          ? res.channel.displayName.slice(1)
          : (res.channel.displayName ?? ""),
      );
      setBio(res.channel.bio ?? "");
      setExistingAvatar(res.channel.avatarUrl);
      setExistingCover(res.channel.coverUrl ?? null);
      setLinks((res.links ?? []).map((l: ReelsChannelLink) => ({ title: l.title, url: l.url })));
      setLoading(false);
    });
  }, [user?.dbId, user?.sessionToken, router]);

  const pickImage = async (kind: "avatar" | "cover") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Please allow Photos access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: kind === "avatar" ? [1, 1] : [16, 9],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    if (kind === "avatar") setPreparingAvatar(true);
    else setPreparingCover(true);
    try {
      const prepared = kind === "avatar"
        ? await prepareChannelAvatar(result.assets[0].uri)
        : await prepareChannelCover(result.assets[0].uri);
      if (kind === "avatar") setAvatarUri(prepared);
      else setCoverUri(prepared);
    } catch {
      Alert.alert("Image", "Could not prepare the photo. Try another image.");
    } finally {
      if (kind === "avatar") setPreparingAvatar(false);
      else setPreparingCover(false);
    }
  };

  const save = async () => {
    if (!user?.dbId) return;
    const name = displayName.trim();
    if (name.length > 0 && name.length < 2) {
      Alert.alert("Channel name", "Use at least 2 characters, or leave blank.");
      return;
    }
    setSaving(true);
    try {
      const res = await updateChannelProfile({
        userId: user.dbId,
        sessionToken: user.sessionToken,
        displayName: name,
        bio: bio.trim(),
        avatarUri: avatarUri ?? undefined,
        coverUri: coverUri ?? undefined,
      });
      if (!res.success) {
        Alert.alert("Could not save", res.message ?? "Please try again.");
        return;
      }
      if (res.channel) {
        setExistingAvatar(res.channel.avatarUrl ?? null);
        setExistingCover(res.channel.coverUrl ?? null);
        setAvatarUri(null);
        setCoverUri(null);
      }
      router.back();
    } catch {
      Alert.alert("Error", "Could not update channel.");
    } finally {
      setSaving(false);
    }
  };

  const addLink = () => {
    if (links.length >= 20) {
      Alert.alert("Links", "Maximum 20 links allowed.");
      return;
    }
    setLinks([...links, { title: "", url: "" }]);
  };

  const updateLink = (index: number, field: "title" | "url", value: string) => {
    setLinks(links.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const saveLinks = async () => {
    if (!user?.dbId) return;
    const cleaned = links
      .map((l) => ({ title: l.title.trim(), url: l.url.trim() }))
      .filter((l) => l.title && l.url);
    setSavingLinks(true);
    try {
      const res = await updateChannelLinks(user.dbId, cleaned, user.sessionToken);
      if (!res.success) {
        Alert.alert("Could not save links", res.message ?? "Please try again.");
        return;
      }
      Alert.alert("Saved", "Channel links updated.");
    } catch {
      Alert.alert("Error", "Could not save links.");
    } finally {
      setSavingLinks(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const avatarPreview = avatarUri ?? existingAvatar;
  const coverPreview = coverUri ?? existingCover;
  const busy = saving || preparingAvatar || preparingCover;

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={Platform.OS === "ios" ? 20 : 16}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>Channel customize</Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Update your logo, cover photo, and channel name here.
      </Text>

      <Text style={[styles.label, { color: colors.foreground }]}>Cover photo (banner)</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{CHANNEL_COVER_HINT}</Text>
      <TouchableOpacity
        style={[styles.coverBox, { borderColor: colors.border }]}
        onPress={() => pickImage("cover")}
        disabled={preparingCover}
      >
        {preparingCover ? (
          <ActivityIndicator color={colors.primary} />
        ) : coverPreview ? (
          <Image source={{ uri: coverPreview }} style={styles.coverImg} contentFit="cover" />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>Choose cover photo</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>16:9 landscape</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.foreground }]}>Channel logo</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{CHANNEL_AVATAR_HINT}</Text>
      <TouchableOpacity
        style={[styles.avatarCard, { borderColor: colors.border }]}
        onPress={() => pickImage("avatar")}
        disabled={preparingAvatar}
      >
        {preparingAvatar ? (
          <ActivityIndicator color={colors.primary} />
        ) : avatarPreview ? (
          <Image source={{ uri: avatarPreview }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="person" size={28} color="#fff" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Change logo</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
            Automatically cropped to a square {CHANNEL_AVATAR_ASPECT}:1 ratio
          </Text>
        </View>
        <Ionicons name="camera-outline" size={22} color={colors.primary} />
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.foreground }]}>Username (@handle)</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Permanent ID — cannot be changed after creation (like a YouTube @username)
      </Text>
      <View style={[styles.readOnly, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>@{handle}</Text>
      </View>

      <Text style={[styles.label, { color: colors.foreground }]}>Channel name</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        This is the name viewers see — it can differ from your @username (e.g. &quot;Videh Official&quot;)
      </Text>
      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        placeholder="e.g. Videh Official"
        placeholderTextColor={colors.mutedForeground}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={80}
      />

      <Text style={[styles.label, { color: colors.foreground }]}>Bio</Text>
      <TextInput
        style={[styles.input, styles.area, { color: colors.foreground, borderColor: colors.border }]}
        placeholder="Tell viewers about your channel"
        placeholderTextColor={colors.mutedForeground}
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={500}
      />

      <Text style={[styles.label, { color: colors.foreground }]}>Links</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        App, website, and social links — shown to viewers in the About section (like YouTube)
      </Text>
      {links.map((link, index) => (
        <View key={index} style={[styles.linkCard, { borderColor: colors.border }]}>
          <View style={styles.linkCardHeader}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Link {index + 1}</Text>
            <TouchableOpacity onPress={() => removeLink(index)}>
              <Ionicons name="trash-outline" size={18} color="#e53935" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginTop: 8 }]}
            placeholder="Title (e.g. Instagram)"
            placeholderTextColor={colors.mutedForeground}
            value={link.title}
            onChangeText={(v) => updateLink(index, "title", v)}
            maxLength={120}
          />
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginTop: 8 }]}
            placeholder="URL (e.g. instagram.com/...)"
            placeholderTextColor={colors.mutedForeground}
            value={link.url}
            onChangeText={(v) => updateLink(index, "url", v)}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>
      ))}
      <TouchableOpacity style={styles.addLinkBtn} onPress={addLink}>
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Add link</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.saveLinksBtn, { borderColor: colors.border, opacity: savingLinks ? 0.6 : 1 }]}
        onPress={() => void saveLinks()}
        disabled={savingLinks}
      >
        {savingLinks ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Save links</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
        onPress={save}
        disabled={busy}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
      </TouchableOpacity>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { marginBottom: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 4, marginTop: 16 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  coverBox: {
    width: "100%",
    aspectRatio: CHANNEL_COVER_ASPECT,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  coverImg: { width: "100%", height: "100%" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center", padding: 16 },
  avatarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  readOnly: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  area: { minHeight: 90, textAlignVertical: "top" },
  linkCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  linkCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addLinkBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8 },
  saveLinksBtn: {
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  saveBtn: { marginTop: 28, paddingVertical: 14, borderRadius: 28, alignItems: "center" },
  saveText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
