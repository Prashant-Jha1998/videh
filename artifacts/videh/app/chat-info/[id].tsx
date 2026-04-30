import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

type GroupMember = {
  id: number;
  name: string;
  phone: string;
  avatar_url?: string;
  about?: string;
  is_online: boolean;
  last_seen?: string;
  is_admin: boolean;
};

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
  const [mediaMessages, setMediaMessages] = useState<Array<{ id: number; type: string; media_url: string; content: string }>>([]);

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

  const setDisappearTimer = () => {
    Alert.alert("Disappearing Messages", "Set a time limit for messages", [
      { text: "Off", onPress: () => { setChatDisappear(id!, null); setDisappearing(null); } },
      { text: "24 hours", onPress: () => { setChatDisappear(id!, 86400); setDisappearing(86400); } },
      { text: "7 days", onPress: () => { setChatDisappear(id!, 604800); setDisappearing(604800); } },
      { text: "90 days", onPress: () => { setChatDisappear(id!, 7776000); setDisappearing(7776000); } },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const disappearLabel = disappearing === null
    ? "Off"
    : disappearing === 86400 ? "24 hours"
    : disappearing === 604800 ? "7 days"
    : disappearing === 7776000 ? "90 days"
    : "Custom";

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

  const searchUser = async () => {
    if (!searchPhone) return;
    try {
      const res = await fetch(`${BASE_URL}/api/users/search/${searchPhone}`);
      const data = await res.json();
      setSearchResult(data.users?.[0] ?? null);
    } catch { setSearchResult(null); }
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
        fetchMembers();
      } else {
        Alert.alert("Error", data.message ?? "Could not add member.");
      }
    } catch { Alert.alert("Error", "Could not add member."); }
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
              <Text style={[styles.noMedia, { color: colors.mutedForeground }]}>Koi media share nahi hua abhi</Text>
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
            onPress={setDisappearTimer}
          />
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

      {/* Profile Photo Fullscreen */}
      <Modal visible={photoVisible} transparent animationType="fade" onRequestClose={() => setPhotoVisible(false)}>
        <View style={styles.photoModal}>
          <TouchableOpacity style={styles.photoClose} onPress={() => setPhotoVisible(false)}>
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
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={addMemberModal} transparent animationType="slide" onRequestClose={() => setAddMemberModal(false)}>
        <View style={styles.addMemberModalWrap}>
          <View style={[styles.addMemberSheet, { backgroundColor: colors.card }]}>
            <View style={styles.addMemberTitle}>
              <Text style={[styles.addMemberTitleText, { color: colors.foreground }]}>Add participant</Text>
              <TouchableOpacity onPress={() => { setAddMemberModal(false); setSearchPhone(""); setSearchResult(null); }}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchRow, { backgroundColor: colors.muted }]}>
              <Ionicons name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                value={searchPhone}
                onChangeText={setSearchPhone}
                placeholder="Search by phone number..."
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                returnKeyType="search"
                onSubmitEditing={searchUser}
              />
            </View>
            <TouchableOpacity style={[styles.searchBtn, { backgroundColor: colors.primary }]} onPress={searchUser}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Search</Text>
            </TouchableOpacity>
            {searchResult && (
              <View style={[styles.searchResultRow, { borderColor: colors.border }]}>
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
            )}
            {searchPhone.length > 0 && searchResult === null && (
              <Text style={[styles.noResult, { color: colors.mutedForeground }]}>No user found with this number</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Member Context Menu */}
      <Modal visible={memberMenuVisible} transparent animationType="fade" onRequestClose={() => setMemberMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMemberMenuVisible(false)}>
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
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMemberMenuVisible(false); if (selectedMember) removeMember(selectedMember); }}>
                  <Ionicons name="person-remove-outline" size={18} color={colors.destructive} />
                  <Text style={[styles.menuItemText, { color: colors.destructive }]}>Remove from group</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  photoClose: { position: "absolute", top: 56, left: 16, zIndex: 10, padding: 8 },
  photoName: { position: "absolute", top: 60, alignSelf: "center", color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", zIndex: 10 },
  photoFull: { width: "100%", height: "80%" },
  bigAvatarFull: { width: 220, height: 220, borderRadius: 110, alignItems: "center", justifyContent: "center" },
  bigAvatarFullText: { color: "#fff", fontSize: 80, fontFamily: "Inter_700Bold" },

  addMemberModalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  addMemberSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, minHeight: 300 },
  addMemberTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  addMemberTitleText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  searchRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },
  searchBtn: { borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 16 },
  searchResultRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  noResult: { textAlign: "center", fontSize: 14, marginTop: 8 },

  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  menuCard: { width: 260, borderRadius: 16, overflow: "hidden", paddingVertical: 8 },
  menuTitle: { fontSize: 16, fontFamily: "Inter_700Bold", paddingHorizontal: 16, paddingVertical: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemText: { fontSize: 15 },
});
