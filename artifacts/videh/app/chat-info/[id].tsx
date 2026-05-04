import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { DismissibleModal } from "@/components/DismissibleModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();
const SCREEN_H = Dimensions.get("window").height;

type AddPickRow = { id: string; name: string; phone: string };

function digitsOnly(p: string): string {
  return p.replace(/\D/g, "");
}

function buildAddPickRows(data: ExistingContact[]): AddPickRow[] {
  const out: AddPickRow[] = [];
  for (const c of data) {
    const nameRaw = (c.name ?? "").trim();
    const phones = (c.phoneNumbers ?? []).map((x) => (x.number ?? "").trim()).filter(Boolean);
    if (!nameRaw && phones.length === 0) continue;
    const displayName = nameRaw || phones[0]!;
    const primaryPhone = phones[0] ?? "";
    out.push({ id: String(c.id), name: displayName, phone: primaryPhone });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

async function loadPagedDeviceContacts(): Promise<ExistingContact[]> {
  const fields = [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers];
  const aggregated: ExistingContact[] = [];
  let pageOffset = 0;
  const pageSize = 500;
  for (let guard = 0; guard < 200; guard++) {
    const res = await Contacts.getContactsAsync({
      fields,
      pageSize,
      pageOffset,
      sort: Contacts.SortTypes.FirstName,
    });
    aggregated.push(...res.data);
    if (!res.hasNextPage) break;
    pageOffset += res.data.length;
  }
  return aggregated;
}

type GroupMember = {
  id: number;
  name: string;
  phone: string;
  avatar_url?: string;
  about?: string;
  is_online: boolean;
  last_seen?: string;
  is_admin: boolean;
  can_send_messages?: boolean;
};

function isPhoneAlreadyInGroup(phone: string, groupMembers: GroupMember[]): boolean {
  const d = digitsOnly(phone);
  if (!d) return false;
  return groupMembers.some((m) => m.phone && digitsOnly(m.phone) === d);
}

type InfoRowProps = {
  icon: string;
  iconBg: string;
  label: string;
  value?: string;
  colors: any;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
};

function InfoRow({ icon, iconBg, label, value, colors, onPress, right, last }: InfoRowProps) {
  return (
    <TouchableOpacity
      style={[styles.infoRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !right}
    >
      <View style={[styles.infoIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.foreground }]}>{label}</Text>
        {value ? <Text style={[styles.infoValue, { color: colors.mutedForeground }]}>{value}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /> : null)}
    </TouchableOpacity>
  );
}

export default function ChatInfoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { chats, pinChat, muteChat, archiveChat, user, blockUser, unblockUser, setChatDisappear, createDirectChat } = useApp();

  const chat = chats.find((c) => c.id === id);
  const isGroup = chat?.isGroup ?? false;

  const [muted, setMuted] = useState(chat?.isMuted ?? false);
  const [disappearing, setDisappearing] = useState<number | null>(null);
  const [aboutText, setAboutText] = useState<string>("Hey there! I am using Videh.");
  const [groupDesc, setGroupDesc] = useState<string>("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState("");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberMenuVisible, setMemberMenuVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [disappearPickerOpen, setDisappearPickerOpen] = useState(false);
  const [addPickRows, setAddPickRows] = useState<AddPickRow[]>([]);
  const [addPickLoading, setAddPickLoading] = useState(false);
  const [addPickPermissionDenied, setAddPickPermissionDenied] = useState(false);
  const [lastServerSearchEmpty, setLastServerSearchEmpty] = useState(false);
  const [mediaMessages, setMediaMessages] = useState<Array<{ id: number; type: string; media_url: string; content: string }>>([]);
  const [groupMessagingPolicy, setGroupMessagingPolicy] = useState<"everyone" | "admins_only" | "allowlist">("everyone");

  const chatOtherUserId = useRef<number | null>(null);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = ((name ?? "?").charCodeAt(0) * 37) % 360;
  const avatarBg = `hsl(${hue},50%,40%)`;

  const fetchContactInfo = useCallback(async () => {
    if (!id || isGroup) return;
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/members`);
      const data = await res.json();
      if (data.success && data.members) {
        const other = data.members.find((m: GroupMember) => m.id !== user?.dbId);
        if (other) {
          chatOtherUserId.current = other.id;
          setAboutText(other.about || "Hey there! I am using Videh.");
        }
      }
    } catch { }
  }, [id, isGroup, user?.dbId]);

  const fetchMembers = useCallback(async () => {
    if (!id || !isGroup) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/members`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.members);
        const me = data.members.find((m: GroupMember) => m.id === user?.dbId);
        setIsAdmin(me?.is_admin ?? false);
      }
    } catch { }
    setLoadingMembers(false);
  }, [id, isGroup, user?.dbId]);

  const fetchMedia = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/messages?limit=200&offset=0`);
      const data = await res.json();
      if (data.success && data.messages) {
        const media = data.messages.filter((m: any) =>
          (m.type === "image" || m.type === "video") && m.media_url && !m.is_deleted
        );
        setMediaMessages(media.slice(0, 18));
      }
    } catch { }
  }, [id]);

  const fetchChatDetails = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/details`);
      const data = await res.json();
      if (data.success && data.chat) {
        setDisappearing(data.chat.disappear_after_seconds ?? null);
        setGroupDesc(data.chat.group_description ?? "");
        setDescInput(data.chat.group_description ?? "");
        const p = data.chat.group_messaging_policy;
        if (p === "admins_only" || p === "allowlist" || p === "everyone") {
          setGroupMessagingPolicy(p);
        } else {
          setGroupMessagingPolicy("everyone");
        }
      }
    } catch { }
  }, [id]);

  useEffect(() => {
    fetchContactInfo();
    fetchMembers();
    fetchChatDetails();
    fetchMedia();
  }, [fetchContactInfo, fetchMembers, fetchChatDetails, fetchMedia]);

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMuted((v) => !v);
    muteChat(id!);
  };

  const doBlock = () => {
    if (!chatOtherUserId.current && !isGroup) {
      Alert.alert("Error", "Cannot identify user.");
      return;
    }
    const targetId = chatOtherUserId.current!;
    const action = isBlocked ? "Unblock" : "Block";
    Alert.alert(
      `${action} ${name ?? "this contact"}`,
      isBlocked
        ? "You will be able to receive messages from them again."
        : "Blocked contacts will no longer be able to call you or send you messages.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            if (isBlocked) {
              await unblockUser(targetId);
              setIsBlocked(false);
            } else {
              await blockUser(targetId);
              setIsBlocked(true);
            }
          },
        },
      ]
    );
  };

  const doArchive = () => {
    Alert.alert("Archive chat?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", onPress: () => { archiveChat(id!); router.replace("/(tabs)/chats"); } },
    ]);
  };

  const closeAddMemberModal = () => {
    setAddMemberModal(false);
    setSearchPhone("");
    setSearchResult(null);
    setAddPickRows([]);
    setAddPickLoading(false);
    setAddPickPermissionDenied(false);
    setLastServerSearchEmpty(false);
  };

  useEffect(() => {
    if (!addMemberModal || Platform.OS === "web") return;
    let cancelled = false;
    setAddPickLoading(true);
    setAddPickPermissionDenied(false);
    void (async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) {
            setAddPickRows([]);
            setAddPickPermissionDenied(true);
          }
          return;
        }
        const raw = await loadPagedDeviceContacts();
        if (cancelled) return;
        setAddPickRows(buildAddPickRows(raw));
      } catch {
        if (!cancelled) setAddPickRows([]);
      } finally {
        if (!cancelled) setAddPickLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addMemberModal]);

  const addPickFiltered = useMemo(() => {
    const q = searchPhone.trim().toLowerCase();
    const qDigits = digitsOnly(searchPhone);
    return addPickRows.filter((r) => {
      if (isPhoneAlreadyInGroup(r.phone, members)) return false;
      if (!q) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && digitsOnly(r.phone).includes(qDigits)) return true;
      return false;
    });
  }, [addPickRows, searchPhone, members]);

  const applyDisappear = (seconds: number | null) => {
    if (!id) return;
    if (seconds === null) {
      setChatDisappear(id, null);
      setDisappearing(null);
    } else {
      setChatDisappear(id, seconds);
      setDisappearing(seconds);
    }
    setDisappearPickerOpen(false);
  };

  const disappearLabel = disappearing === null
    ? "Off"
    : disappearing === 86400 ? "24 hours"
    : disappearing === 604800 ? "7 days"
    : disappearing === 7776000 ? "90 days"
    : "Custom";

  const groupMessagingLabel =
    groupMessagingPolicy === "everyone"
      ? "All members"
      : groupMessagingPolicy === "admins_only"
        ? "Admins only"
        : "Selected members";

  const persistGroupMessagingPolicy = async (policy: "everyone" | "admins_only" | "allowlist", resetAllowlist?: boolean) => {
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/group-messaging-policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: user?.dbId,
          policy,
          resetAllowlist,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGroupMessagingPolicy(policy);
        void fetchMembers();
      } else {
        Alert.alert("Could not update", data.message ?? "Only admins can change this setting.");
      }
    } catch {
      Alert.alert("Error", "Could not update group messaging settings.");
    }
  };

  const openGroupMessagingPicker = () => {
    if (!isAdmin) return;
    Alert.alert(
      "Who can send messages",
      "Choose who is allowed to send messages in this group.",
      [
        { text: "All members", onPress: () => { void persistGroupMessagingPolicy("everyone"); } },
        { text: "Only admins", onPress: () => { void persistGroupMessagingPolicy("admins_only"); } },
        {
          text: "Selected members",
          onPress: () => {
            Alert.alert(
              "Selected members mode",
              "Members who are not admins will not be able to send messages until you allow them individually.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Continue", onPress: () => { void persistGroupMessagingPolicy("allowlist", true); } },
              ],
            );
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const toggleMemberSendPermission = async (member: GroupMember, allow: boolean) => {
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/members/${member.id}/send-permission`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: user?.dbId, canSendMessages: allow }),
      });
      const data = await res.json();
      if (data.success) {
        setMemberMenuVisible(false);
        void fetchMembers();
      } else {
        Alert.alert("Could not update", data.message ?? "Try again.");
      }
    } catch {
      Alert.alert("Error", "Could not update send permission.");
    }
  };

  const saveGroupDesc = async () => {
    try {
      await fetch(`${BASE_URL}/api/chats/${id}/description`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descInput, requesterId: user?.dbId }),
      });
      setGroupDesc(descInput);
      setEditingDesc(false);
    } catch { setEditingDesc(false); }
  };

  const shareGroupInviteLink = async () => {
    if (!id) return;
    const inviteLink = `videh://join-group?id=${id}`;
    await Share.share({
      message: `Join our group on Videh: ${inviteLink}`,
      url: inviteLink,
      title: "Group invite link",
    }).catch(() => {});
  };

  const searchUser = async () => {
    const raw = searchPhone.trim();
    if (!raw) return;
    setLastServerSearchEmpty(false);
    try {
      const enc = encodeURIComponent(raw.replace(/\s+/g, ""));
      const res = await fetch(`${BASE_URL}/api/users/search/${enc}`);
      const data = await res.json();
      const first = data.users?.[0] ?? null;
      setSearchResult(first);
      setLastServerSearchEmpty(!first);
    } catch {
      setSearchResult(null);
      setLastServerSearchEmpty(true);
    }
  };

  const addMember = async (memberId: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, requesterId: user?.dbId }),
      });
      const data = await res.json();
      if (data.success) {
        setAddMemberModal(false);
        setSearchPhone("");
        setSearchResult(null);
        setAddPickRows([]);
        setAddPickLoading(false);
        setAddPickPermissionDenied(false);
        setLastServerSearchEmpty(false);
        fetchMembers();
      } else {
        Alert.alert("Error", data.message ?? "Could not add member.");
      }
    } catch { Alert.alert("Error", "Could not add member."); }
  };

  const lookupContactAndAdd = async (row: AddPickRow) => {
    if (!id || !row.phone?.trim()) {
      Alert.alert("No phone", "This contact has no phone number on file.");
      return;
    }
    if (isPhoneAlreadyInGroup(row.phone, members)) {
      Alert.alert("Already in group", "This person is already a member.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const enc = encodeURIComponent(row.phone.replace(/\s+/g, ""));
    try {
      const res = await fetch(`${BASE_URL}/api/users/search/${enc}`);
      const data = await res.json();
      const u = data.users?.[0] as { id: number } | undefined;
      if (!u) {
        Alert.alert("Not on Videh", "This number is not registered on Videh yet. Ask them to sign up first.");
        return;
      }
      await addMember(u.id);
    } catch {
      Alert.alert("Error", "Could not look up this contact.");
    }
  };

  const removeMember = (member: GroupMember) => {
    Alert.alert(`Remove ${member.name}?`, "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try {
            await fetch(`${BASE_URL}/api/chats/${id}/members/${member.id}`, {
              method: "DELETE", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: user?.dbId }),
            });
            fetchMembers();
          } catch { }
        }
      }
    ]);
  };

  const toggleAdmin = (member: GroupMember) => {
    Alert.alert(
      member.is_admin ? `Remove admin from ${member.name}?` : `Make ${member.name} admin?`,
      "", [
        { text: "Cancel", style: "cancel" },
        {
          text: member.is_admin ? "Remove admin" : "Make admin", onPress: async () => {
            try {
              await fetch(`${BASE_URL}/api/chats/${id}/members/${member.id}/admin`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requesterId: user?.dbId, isAdmin: !member.is_admin }),
              });
              fetchMembers();
            } catch { }
          }
        }
      ]
    );
  };

  const openMemberMenu = (member: GroupMember) => {
    if (member.id === user?.dbId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMember(member);
    setMemberMenuVisible(true);
  };

  const goToChat = async (member: GroupMember) => {
    setMemberMenuVisible(false);
    const chatId = await createDirectChat(member.id, member.name, member.avatar_url);
    router.push({ pathname: "/chat/[id]", params: { id: chatId, name: member.name } });
  };

  const getLastSeenText = (m: GroupMember) => {
    if (m.is_online) return "online";
    if (!m.last_seen) return "last seen recently";
    const d = new Date(m.last_seen);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHrs = diffMs / 3600000;
    if (diffHrs < 1) return `last seen ${Math.round(diffMs / 60000)} min ago`;
    if (diffHrs < 24) return `last seen today at ${formatTime(new Date(m.last_seen).getTime())}`;
    if (diffHrs < 48) return `last seen yesterday at ${formatTime(new Date(m.last_seen).getTime())}`;
    return `last seen ${d.toLocaleDateString()}`;
  };

  const chatLastSeen = members.find(m => m.id !== user?.dbId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isGroup ? "Group Info" : "Contact Info"}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false}>
        {/* Profile block */}
        <View style={[styles.profileBlock, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={() => setPhotoVisible(true)} activeOpacity={0.85}>
            {chat?.avatar ? (
              <Image source={{ uri: chat.avatar }} style={styles.bigAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.bigAvatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.bigAvatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.contactName, { color: colors.foreground }]}>{name ?? chat?.name}</Text>
          {!isGroup && (
            <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>
              {chatLastSeen ? getLastSeenText(chatLastSeen) : (chat?.isOnline ? "online" : "last seen recently")}
            </Text>
          )}
          {isGroup && (
            <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>
              {members.length} participants
            </Text>
          )}

          <View style={styles.quickActions}>
            {!isGroup && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: colors.primary + "18" }]}
                onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "audio" } })}
              >
                <Ionicons name="call" size={22} color={colors.primary} />
                <Text style={[styles.quickBtnLabel, { color: colors.primary }]}>Audio</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18" }]}
              onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "video" } })}
            >
              <Ionicons name="videocam" size={22} color={colors.primary} />
              <Text style={[styles.quickBtnLabel, { color: colors.primary }]}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: colors.primary + "18" }]}
              onPress={() => router.back()}
            >
              <Ionicons name="chatbubble" size={22} color={colors.primary} />
              <Text style={[styles.quickBtnLabel, { color: colors.primary }]}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About / Group Description */}
        {!isGroup && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>About</Text>
            <Text style={[styles.sectionValue, { color: colors.foreground }]}>{aboutText}</Text>
          </View>
        )}
        {isGroup && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <View style={styles.descHeader}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>Description</Text>
              {isAdmin && !editingDesc && (
                <TouchableOpacity onPress={() => setEditingDesc(true)}>
                  <Ionicons name="pencil" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            {editingDesc ? (
              <View>
                <TextInput
                  style={[styles.descInput, { color: colors.foreground, borderColor: colors.primary }]}
                  value={descInput}
                  onChangeText={setDescInput}
                  multiline
                  placeholder="Add group description..."
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                />
                <View style={styles.descBtns}>
                  <TouchableOpacity onPress={() => { setEditingDesc(false); setDescInput(groupDesc); }} style={styles.descBtn}>
                    <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveGroupDesc} style={[styles.descBtn, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: "#fff" }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={[styles.sectionValue, { color: groupDesc ? colors.foreground : colors.mutedForeground }]}>
                {groupDesc || (isAdmin ? "Add group description" : "No description")}
              </Text>
            )}
            {isAdmin && (
              <TouchableOpacity style={styles.inviteLinkRow} onPress={shareGroupInviteLink}>
                <Ionicons name="link-outline" size={16} color={colors.primary} />
                <Text style={[styles.inviteLinkText, { color: colors.primary }]}>Invite via link</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Media, Links, Docs */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.primary }]}>Media, Links, and Docs</Text>
            {mediaMessages.length > 0 && (
              <Text style={[styles.seeAll, { color: colors.primary }]}>{mediaMessages.length} items</Text>
            )}
          </View>
          {mediaMessages.length > 0 ? (
            <View style={styles.mediaGrid}>
              {mediaMessages.slice(0, 9).map((m) => (
                <View key={m.id} style={[styles.mediaThumbnail, { backgroundColor: colors.muted }]}>
                  {m.type === "image" && m.media_url ? (
                    <Image source={{ uri: m.media_url }} style={styles.mediaThumbnailImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.mediaThumbnail, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="videocam" size={24} color={colors.mutedForeground} />
                    </View>
                  )}
                </View>
              ))}
              {mediaMessages.length > 9 && (
                <View style={[styles.mediaThumbnail, { backgroundColor: colors.muted + "cc", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={[styles.moreMediaText, { color: colors.foreground }]}>+{mediaMessages.length - 9}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noMediaRow}>
              <Ionicons name="image-outline" size={32} color={colors.mutedForeground} />
              <Text style={[styles.noMedia, { color: colors.mutedForeground }]}>No media has been shared yet.</Text>
            </View>
          )}
        </View>

        {/* Settings */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <InfoRow
            icon="notifications-outline"
            iconBg="#FF9800"
            label="Mute notifications"
            colors={colors}
            right={<Switch value={muted} onValueChange={toggleMute} thumbColor={muted ? colors.primary : "#f4f3f4"} trackColor={{ true: colors.primary + "80" }} />}
          />
          <InfoRow
            icon="timer-outline"
            iconBg="#9C27B0"
            label="Disappearing messages"
            value={disappearLabel}
            colors={colors}
            onPress={() => setDisappearPickerOpen(true)}
          />
          {isGroup && (
            <InfoRow
              icon="chatbubbles-outline"
              iconBg="#00897B"
              label="Who can send messages"
              value={groupMessagingLabel}
              colors={colors}
              onPress={isAdmin ? openGroupMessagingPicker : undefined}
            />
          )}
          <InfoRow
            icon="lock-closed-outline"
            iconBg="#4CAF50"
            label="Encryption"
            value="Messages are end-to-end encrypted"
            colors={colors}
            onPress={() => Alert.alert("End-to-End Encryption", "Messages and calls are secured with end-to-end encryption.")}
          />
          <InfoRow
            icon="pin-outline"
            iconBg="#2196F3"
            label="Pin chat"
            colors={colors}
            onPress={() => { pinChat(id!); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Pinned", "Chat has been pinned."); }}
          />
          <InfoRow
            icon="archive-outline"
            iconBg="#607D8B"
            label="Archive chat"
            colors={colors}
            onPress={doArchive}
            last
          />
        </View>

        {/* Group Members */}
        {isGroup && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <View style={styles.membersHeader}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>
                {members.length} participants
              </Text>
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.addMemberBtn, { backgroundColor: colors.primary + "18" }]}
                  onPress={() => setAddMemberModal(true)}
                >
                  <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                  <Text style={[styles.addMemberText, { color: colors.primary }]}>Add</Text>
                </TouchableOpacity>
              )}
            </View>
            {members.map((m) => {
              const mInitials = (m.name || "?").slice(0, 2).toUpperCase();
              const mHue = ((m.name ?? "?").charCodeAt(0) * 37) % 360;
              const isMe = m.id === user?.dbId;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberRow, { borderBottomColor: colors.border }]}
                  onPress={() => !isMe && openMemberMenu(m)}
                  activeOpacity={isMe ? 1 : 0.7}
                >
                  {m.avatar_url ? (
                    <Image source={{ uri: m.avatar_url }} style={styles.memberAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.memberAvatar, { backgroundColor: `hsl(${mHue},50%,45%)` }]}>
                      <Text style={styles.memberInitials}>{mInitials}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>
                      {isMe ? "You" : (m.name || m.phone)}
                    </Text>
                    <Text style={[styles.memberPhone, { color: colors.mutedForeground }]}>
                      {m.about || "Hey there! I am using Videh."}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    {m.is_admin && (
                      <View style={[styles.adminBadge, { backgroundColor: colors.primary + "18" }]}>
                        <Text style={[styles.adminText, { color: colors.primary }]}>Admin</Text>
                      </View>
                    )}
                    <View style={[styles.onlineDot, { backgroundColor: m.is_online ? "#25D366" : "transparent", borderColor: m.is_online ? "transparent" : colors.border }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Danger Zone */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {!isGroup && (
            <TouchableOpacity style={styles.dangerRow} onPress={doBlock} activeOpacity={0.7}>
              <Ionicons name={isBlocked ? "checkmark-circle-outline" : "ban-outline"} size={20} color={isBlocked ? colors.primary : colors.destructive} />
              <Text style={[styles.dangerText, { color: isBlocked ? colors.primary : colors.destructive }]}>
                {isBlocked ? `Unblock ${name}` : `Block ${name}`}
              </Text>
            </TouchableOpacity>
          )}
          {isGroup && (
            <TouchableOpacity
              style={styles.dangerRow}
              onPress={() => Alert.alert("Leave group?", "You will no longer receive messages from this group.", [
                { text: "Cancel", style: "cancel" },
                { text: "Leave", style: "destructive", onPress: async () => {
                  if (!user?.dbId || !id) return;
                  await fetch(`${BASE_URL}/api/chats/${id}/members/${user.dbId}`, {
                    method: "DELETE", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ requesterId: user.dbId }),
                  }).catch(() => {});
                  router.replace("/(tabs)/chats");
                }}
              ])}
              activeOpacity={0.7}
            >
              <Ionicons name="exit-outline" size={20} color={colors.destructive} />
              <Text style={[styles.dangerText, { color: colors.destructive }]}>Leave group</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.dangerRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]} onPress={() => Alert.alert("Report", "Your report has been submitted.")} activeOpacity={0.7}>
            <Ionicons name="flag-outline" size={20} color={colors.destructive} />
            <Text style={[styles.dangerText, { color: colors.destructive }]}>Report {isGroup ? "group" : name}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Profile Photo Fullscreen — tap outside / back closes */}
      <Modal visible={photoVisible} transparent animationType="fade" onRequestClose={() => setPhotoVisible(false)}>
        <Pressable style={styles.photoModal} onPress={() => setPhotoVisible(false)}>
          <TouchableOpacity style={styles.photoClose} onPress={() => setPhotoVisible(false)} activeOpacity={0.8}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.photoName}>{name ?? chat?.name}</Text>
          {chat?.avatar ? (
            <Image source={{ uri: chat.avatar }} style={styles.photoFull} contentFit="contain" />
          ) : (
            <View style={[styles.bigAvatarFull, { backgroundColor: avatarBg }]}>
              <Text style={styles.bigAvatarFullText}>{initials}</Text>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Disappearing messages — modal (tap scrim or back to dismiss) */}
      <DismissibleModal visible={disappearPickerOpen} onClose={() => setDisappearPickerOpen(false)} animationType="fade">
        <View style={styles.disappearCenter}>
          <View style={[styles.disappearCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.disappearTitle, { color: colors.foreground }]}>Disappearing Messages</Text>
            <Text style={[styles.disappearSub, { color: colors.mutedForeground }]}>Set a time limit for messages</Text>
            <TouchableOpacity style={styles.disappearRow} onPress={() => applyDisappear(null)}>
              <Text style={[styles.disappearRowText, { color: colors.primary }]}>Off</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.disappearRow} onPress={() => applyDisappear(86400)}>
              <Text style={[styles.disappearRowText, { color: colors.primary }]}>24 hours</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.disappearRow} onPress={() => applyDisappear(604800)}>
              <Text style={[styles.disappearRowText, { color: colors.primary }]}>7 days</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.disappearRow} onPress={() => applyDisappear(7776000)}>
              <Text style={[styles.disappearRowText, { color: colors.primary }]}>90 days</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.disappearRow} onPress={() => setDisappearPickerOpen(false)}>
              <Text style={[styles.disappearCancel, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </DismissibleModal>

      {/* Add Member Modal — device contacts + phone search */}
      <DismissibleModal visible={addMemberModal} onClose={closeAddMemberModal} animationType="slide">
        <KeyboardAvoidingView
          style={styles.addMemberOuter}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
        >
          <View
            style={[
              styles.addMemberSheet,
              { backgroundColor: colors.card, height: Math.min(SCREEN_H * 0.88, 640), maxHeight: SCREEN_H * 0.92 },
            ]}
          >
            <View style={styles.addMemberTitle}>
              <Text style={[styles.addMemberTitleText, { color: colors.foreground }]}>Add participant</Text>
              <TouchableOpacity onPress={closeAddMemberModal} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.searchInputWrap,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
            >
              <Ionicons name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                value={searchPhone}
                onChangeText={(t) => {
                  setSearchPhone(t);
                  setSearchResult(null);
                  setLastServerSearchEmpty(false);
                }}
                placeholder="Search name or phone number..."
                placeholderTextColor={colors.mutedForeground}
                keyboardType="default"
                returnKeyType="search"
                onSubmitEditing={searchUser}
                autoCorrect={false}
                autoCapitalize="none"
                underlineColorAndroid="transparent"
                selectionColor={colors.primary}
                caretHidden={false}
              />
            </View>
            <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colors.primary }]} onPress={searchUser}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Search on Videh</Text>
            </TouchableOpacity>
            {searchResult ? (
              <View style={[styles.searchResultRow, { borderColor: colors.border, marginBottom: 10 }]}>
                <View style={[styles.memberAvatar, { backgroundColor: `hsl(${(searchResult.name ?? "?").charCodeAt(0) * 37 % 360},50%,45%)` }]}>
                  <Text style={styles.memberInitials}>{(searchResult.name ?? "?").slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.foreground }]}>{searchResult.name}</Text>
                  <Text style={[styles.memberPhone, { color: colors.mutedForeground }]}>{searchResult.phone}</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => addMember(searchResult.id)}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {lastServerSearchEmpty && searchPhone.trim().length > 0 ? (
              <Text style={[styles.noResult, { color: colors.mutedForeground, marginBottom: 8 }]}>No user found with this number</Text>
            ) : null}
            {addPickPermissionDenied ? (
              <Text style={[styles.addPickHint, { color: colors.mutedForeground }]}>
                Allow Contacts access in system settings to pick people from your phonebook.
              </Text>
            ) : null}
            {addPickLoading ? (
              <View style={styles.addPickLoadingWrap}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.addPickHint, { color: colors.mutedForeground, marginTop: 8 }]}>Loading contacts…</Text>
              </View>
            ) : null}
            <Text style={[styles.addPickSectionLabel, { color: colors.mutedForeground }]}>Contacts</Text>
            <FlatList
              data={addPickFiltered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.addPickList}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16, flexGrow: 1 }}
              nestedScrollEnabled
              renderItem={({ item }) => {
                const hasPhone = Boolean(item.phone?.trim());
                return (
                  <View style={[styles.addPickRow, { borderBottomColor: colors.border }]}>
                    <View
                      style={[
                        styles.memberAvatar,
                        { backgroundColor: `hsl(${(item.name || "?").charCodeAt(0) * 37 % 360},50%,45%)` },
                      ]}
                    >
                      <Text style={styles.memberInitials}>{(item.name || "?").slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.memberPhone, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {hasPhone ? item.phone : "No phone number"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.addBtn, { backgroundColor: colors.primary, opacity: !hasPhone ? 0.45 : 1 }]}
                      disabled={!hasPhone}
                      onPress={() => void lookupContactAndAdd(item)}
                    >
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                !addPickLoading && !addPickPermissionDenied ? (
                  <Text style={[styles.addPickHint, { color: colors.mutedForeground }]}>
                    {Platform.OS === "web"
                      ? "Contact list is available on the mobile app. Use search above to add by phone."
                      : addPickRows.length === 0
                        ? "No contacts on this device, or contacts could not be loaded."
                        : "No contacts match your search."}
                  </Text>
                ) : null
              }
            />
          </View>
        </KeyboardAvoidingView>
      </DismissibleModal>

      {/* Member Context Menu */}
      <DismissibleModal visible={memberMenuVisible} onClose={() => setMemberMenuVisible(false)} animationType="fade">
        <View style={styles.menuOverlay}>
          <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.menuTitle, { color: colors.foreground }]}>{selectedMember?.name}</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => selectedMember && goToChat(selectedMember)}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.foreground} />
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Message</Text>
            </TouchableOpacity>
            {isAdmin && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMemberMenuVisible(false); if (selectedMember) toggleAdmin(selectedMember); }}>
                  <Ionicons name={selectedMember?.is_admin ? "remove-circle-outline" : "shield-checkmark-outline"} size={18} color={colors.foreground} />
                  <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                    {selectedMember?.is_admin ? "Remove as admin" : "Make group admin"}
                  </Text>
                </TouchableOpacity>
                {groupMessagingPolicy === "allowlist" && selectedMember && !selectedMember.is_admin && (
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      if (!selectedMember) return;
                      const next = selectedMember.can_send_messages === false;
                      setMemberMenuVisible(false);
                      void toggleMemberSendPermission(selectedMember, next);
                    }}
                  >
                    <Ionicons name={selectedMember?.can_send_messages === false ? "checkmark-circle-outline" : "close-circle-outline"} size={18} color={colors.foreground} />
                    <Text style={[styles.menuItemText, { color: colors.foreground }]}>
                      {selectedMember?.can_send_messages === false ? "Allow to send messages" : "Remove send permission"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMemberMenuVisible(false); if (selectedMember) removeMember(selectedMember); }}>
                  <Ionicons name="person-remove-outline" size={18} color={colors.destructive} />
                  <Text style={[styles.menuItemText, { color: colors.destructive }]}>Remove from group</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </DismissibleModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 12, backgroundColor: "#00A884" },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff", marginLeft: 8 },
  headerBtn: { padding: 8 },

  profileBlock: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 16, marginBottom: 8 },
  bigAvatar: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  bigAvatarText: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  cameraOverlay: { position: "absolute", bottom: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: 4 },
  contactName: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 12 },
  contactSub: { fontSize: 13, marginTop: 4 },
  quickActions: { flexDirection: "row", gap: 16, marginTop: 20 },
  quickBtn: { alignItems: "center", padding: 12, borderRadius: 12, minWidth: 72, gap: 4 },
  quickBtnLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  section: { marginBottom: 8, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  sectionValue: { fontSize: 15 },
  descHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  descInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15, marginTop: 4, minHeight: 64 },
  descBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  inviteLinkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start" },
  inviteLinkText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  descBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },

  mediaRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  mediaPlaceholder: { width: 72, height: 72, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  noMedia: { fontSize: 13 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 4 },
  mediaThumbnail: { width: 80, height: 80, borderRadius: 6, overflow: "hidden" },
  mediaThumbnailImg: { width: "100%", height: "100%" },
  noMediaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  moreMediaText: { fontSize: 18, fontFamily: "Inter_700Bold" },

  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  infoIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 15 },
  infoValue: { fontSize: 12, marginTop: 2 },

  membersHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  addMemberBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  addMemberText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, gap: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  memberInitials: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberPhone: { fontSize: 12, marginTop: 1 },
  adminBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  onlineDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1 },

  dangerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 },
  dangerText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  photoModal: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  disappearCenter: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 },
  disappearCard: { width: "100%", maxWidth: 320, borderRadius: 14, paddingVertical: 8, overflow: "hidden" },
  disappearTitle: { fontSize: 18, fontFamily: "Inter_700Bold", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  disappearSub: { fontSize: 14, fontFamily: "Inter_400Regular", paddingHorizontal: 18, paddingBottom: 10 },
  disappearRow: { paddingVertical: 14, paddingHorizontal: 18 },
  disappearRowText: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  disappearCancel: { fontSize: 17, fontFamily: "Inter_500Medium", textAlign: "center" },
  photoClose: { position: "absolute", top: 56, left: 16, zIndex: 10, padding: 8 },
  photoName: { position: "absolute", top: 60, alignSelf: "center", color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", zIndex: 10 },
  photoFull: { width: "100%", height: "80%" },
  bigAvatarFull: { width: 220, height: 220, borderRadius: 110, alignItems: "center", justifyContent: "center" },
  bigAvatarFullText: { color: "#fff", fontSize: 80, fontFamily: "Inter_700Bold" },

  addMemberOuter: { flex: 1, justifyContent: "flex-end", width: "100%" },
  addMemberSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 12,
    width: "100%",
    flexGrow: 0,
    flexDirection: "column",
  },
  addMemberTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  addMemberTitleText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 48,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: Platform.OS === "android" ? 10 : 12, minHeight: 44 },
  searchBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 12 },
  addPickSectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  addPickList: { flex: 1, minHeight: 120 },
  addPickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  addPickHint: { fontSize: 14, lineHeight: 20 },
  addPickLoadingWrap: { alignItems: "center", paddingVertical: 12 },
  searchResultRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  noResult: { textAlign: "center", fontSize: 14, marginTop: 8 },

  menuOverlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  menuCard: { width: 260, borderRadius: 16, overflow: "hidden", paddingVertical: 8 },
  menuTitle: { fontSize: 16, fontFamily: "Inter_700Bold", paddingHorizontal: 16, paddingVertical: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 15 },
});
