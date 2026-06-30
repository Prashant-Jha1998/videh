import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, useFocusEffect, type Href } from "expo-router";
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
import { DisappearTimerBadge } from "@/components/DisappearTimerBadge";
import { disappearTimerLabel, isChatDisappearingEnabled } from "@/lib/disappearTimerOptions";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import { formatTime } from "@/utils/time";
import { formatPresenceSubtitle } from "@/lib/presence";
import { MemberProfileSheet } from "@/components/MemberProfileSheet";
import { ChatMediaGalleryModal } from "@/components/web/ChatMediaGalleryModal";
import { fetchChatSharedMedia } from "@/lib/chatSharedMedia";
import { saveImageUriToLibrary } from "@/lib/saveImageToLibrary";
import { getApiUrl } from "@/lib/api";
import { INDIAN_LANGUAGE_OPTIONS, languageNativeLabel } from "@/lib/indianLanguages";
import { normalizeRouteParam } from "@/lib/routeParams";
import { getGroupInfoCache, patchGroupInfoCache } from "@/lib/groupInfoCache";
import { readLocalGroupTranslateLang, writeLocalGroupTranslateLang } from "@/lib/groupTranslationPrefs";

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
  const { id: rawId, name: rawName } = useLocalSearchParams<{ id: string; name: string }>();
  const id = normalizeRouteParam(rawId);
  const name = normalizeRouteParam(rawName);
  const { chats, pinChat, muteChat, archiveChat, user, blockUser, unblockUser, reportUser, createDirectChat, updateGroupAvatar, patchChatInList, loadMessages } = useApp();
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const authedJsonHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(user?.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
  }), [user?.sessionToken]);

  const chat = chats.find((c) => c.id === id);
  const bootCache = id ? getGroupInfoCache(id) : null;
  const [serverIsGroup, setServerIsGroup] = useState<boolean | null>(
    bootCache?.isGroup ?? (chat?.isGroup ? true : null),
  );
  const isGroup = serverIsGroup ?? chat?.isGroup ?? false;

  const [muted, setMuted] = useState(chat?.isMuted ?? false);
  const [disappearing, setDisappearing] = useState<number | null>(
    bootCache?.disappearing ?? chat?.disappearAfterSeconds ?? null,
  );
  const [aboutText, setAboutText] = useState<string>("Hey there! I am using Videh.");
  const [groupDesc, setGroupDesc] = useState<string>(bootCache?.groupDesc ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(bootCache?.groupDesc ?? "");
  const [descSaving, setDescSaving] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>(bootCache?.members ?? []);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [mediaPreviewUri, setMediaPreviewUri] = useState<string | null>(null);
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(bootCache?.isAdmin ?? false);
  const [memberMenuVisible, setMemberMenuVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [profileMember, setProfileMember] = useState<GroupMember | null>(null);
  const [otherContact, setOtherContact] = useState<GroupMember | null>(null);
  const [addPickRows, setAddPickRows] = useState<AddPickRow[]>([]);
  const [addPickLoading, setAddPickLoading] = useState(false);
  const [addPickPermissionDenied, setAddPickPermissionDenied] = useState(false);
  const [lastServerSearchEmpty, setLastServerSearchEmpty] = useState(false);
  const [mediaMessages, setMediaMessages] = useState<Array<{ id: string; type: string; media_url: string; content: string }>>([]);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const [mediaTotalCount, setMediaTotalCount] = useState(0);
  const [groupMessagingPolicy, setGroupMessagingPolicy] = useState<"everyone" | "admins_only" | "allowlist">(
    bootCache?.groupMessagingPolicy ?? "everyone",
  );
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(
    bootCache?.autoTranslateEnabled ?? chat?.autoTranslateEnabled ?? false,
  );
  const [memberAutoTranslate, setMemberAutoTranslate] = useState(
    bootCache?.memberAutoTranslate ?? true,
  );
  const [memberTranslateLang, setMemberTranslateLang] = useState<string | null>(
    bootCache?.memberTranslateLang ?? null,
  );
  const [effectiveLangLabel, setEffectiveLangLabel] = useState(
    bootCache?.effectiveLangLabel ?? "English",
  );
  const [groupLangPickerOpen, setGroupLangPickerOpen] = useState(false);

  const chatOtherUserId = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = ((name ?? "?").charCodeAt(0) * 37) % 360;
  const avatarBg = `hsl(${hue},50%,40%)`;

  const openSharedMedia = useCallback((m: { type: string; media_url: string }) => {
    if (!m.media_url) return;
    if (m.type === "video") {
      router.push({
        pathname: "/chat/video-viewer",
        params: {
          remoteUri: encodeURIComponent(m.media_url),
          senderLabel: name ?? "Shared video",
        },
      } as unknown as Parameters<typeof router.push>[0]);
      return;
    }
    setMediaPreviewUri(m.media_url);
  }, [router, name]);

  const mediaImageSource = useCallback((uri: string) => {
    if (uri.includes("/api/chats/media/") && user?.sessionToken) {
      return { uri, headers: authFetchHeaders(user.sessionToken) as Record<string, string> };
    }
    return { uri };
  }, [user?.sessionToken]);

  const fetchContactInfo = useCallback(async () => {
    if (!id || isGroup) return;
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/members`);
      const data = await res.json();
      if (data.success && data.members) {
        const other = data.members.find((m: GroupMember) => m.id !== user?.dbId);
        if (other) {
          chatOtherUserId.current = other.id;
          setOtherContact(other);
          setAboutText(other.about || "Hey there! I am using Videh.");
          fetch(`${BASE_URL}/api/users/${user?.dbId}/block-status?otherUserId=${other.id}`)
            .then((r) => r.json())
            .then((s: { success?: boolean; i_blocked_them?: boolean }) => {
              if (s.success) setIsBlocked(Boolean(s.i_blocked_them));
            })
            .catch(() => {});
        }
      }
    } catch { }
  }, [id, isGroup, user?.dbId]);

  const fetchMembers = useCallback(async () => {
    if (!id) return;
    setLoadingMembers(true);
    try {
      const headers: Record<string, string> = {};
      if (user?.sessionToken) headers.Authorization = `Bearer ${user.sessionToken}`;
      const q = user?.dbId ? `?userId=${user.dbId}` : "";
      const res = await fetch(`${BASE_URL}/api/chats/${id}/members${q}`, { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.members)) {
        setMembers(data.members);
        const me = data.members.find((m: GroupMember) => Number(m.id) === Number(user?.dbId));
        const admin = me ? Boolean(me.is_admin) : isAdmin;
        if (me) setIsAdmin(admin);
        patchGroupInfoCache(id, {
          members: data.members,
          isAdmin: admin,
          isGroup: true,
        });
      }
    } catch { }
    setLoadingMembers(false);
  }, [id, user?.dbId, user?.sessionToken]);

  const fetchMedia = useCallback(async () => {
    if (!id || !user?.dbId) return;
    try {
      const buckets = await fetchChatSharedMedia(id, user.dbId, user.sessionToken, 300);
      const combined = [...buckets.media, ...buckets.docs].map((m) => ({
        id: m.id,
        type: m.kind,
        media_url: m.mediaUrl ?? "",
        content: m.content,
      }));
      setMediaTotalCount(combined.length + buckets.links.length);
      setMediaMessages(combined.slice(0, 9));
    } catch { }
  }, [id, user?.dbId, user?.sessionToken]);

  const fetchChatDetails = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    try {
      const headers: Record<string, string> = {};
      if (user?.sessionToken) headers.Authorization = `Bearer ${user.sessionToken}`;
      const res = await fetch(`${BASE_URL}/api/chats/${id}/details`, { headers });
      const data = await res.json();
      if (data.success && data.chat) {
        const group = Boolean(data.chat.is_group);
        setServerIsGroup(group);
        setDisappearing(data.chat.disappear_after_seconds ?? null);
        setGroupDesc(data.chat.group_description ?? "");
        setDescInput(data.chat.group_description ?? "");
        const p = data.chat.group_messaging_policy;
        if (p === "admins_only" || p === "allowlist" || p === "everyone") {
          setGroupMessagingPolicy(p);
        } else {
          setGroupMessagingPolicy("everyone");
        }
        setAutoTranslateEnabled(Boolean(data.chat.auto_translate_enabled));
        if (data.chat.viewer_is_admin !== undefined) {
          setIsAdmin(Boolean(data.chat.viewer_is_admin));
        }
        patchGroupInfoCache(id, {
          isGroup: group,
          groupDesc: data.chat.group_description ?? "",
          disappearing: data.chat.disappear_after_seconds ?? null,
          groupMessagingPolicy:
            p === "admins_only" || p === "allowlist" || p === "everyone" ? p : "everyone",
          autoTranslateEnabled: Boolean(data.chat.auto_translate_enabled),
          isAdmin:
            data.chat.viewer_is_admin !== undefined
              ? Boolean(data.chat.viewer_is_admin)
              : undefined,
        });
        return group;
      }
    } catch { }
    return serverIsGroup ?? chat?.isGroup ?? false;
  }, [id, user?.sessionToken, serverIsGroup, chat?.isGroup]);

  const fetchTranslationSettings = useCallback(async () => {
    if (!id || !user?.dbId) return;
    try {
      const res = await fetch(
        `${BASE_URL}/api/chats/${id}/translation-settings?userId=${user.dbId}`,
        { headers: user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : undefined },
      );
      const data = await res.json();
      if (data.success) {
        let lang = data.memberTranslateLang ?? null;
        if (!lang && id) {
          const localLang = await readLocalGroupTranslateLang(id);
          if (localLang) {
            lang = localLang;
            if (data.memberTranslateLang == null && user?.dbId) {
              void fetch(`${BASE_URL}/api/chats/${id}/translation-settings`, {
                method: "PUT",
                headers: authedJsonHeaders(),
                body: JSON.stringify({ userId: user.dbId, translateLang: localLang }),
              }).catch(() => {});
            }
          }
        }
        setAutoTranslateEnabled(Boolean(data.groupAutoTranslateEnabled));
        setMemberAutoTranslate(data.memberAutoTranslateEnabled !== false);
        setMemberTranslateLang(lang);
        const label = data.effectiveLangName ?? languageNativeLabel(data.effectiveLang ?? lang ?? "en");
        setEffectiveLangLabel(label);
        patchGroupInfoCache(id, {
          autoTranslateEnabled: Boolean(data.groupAutoTranslateEnabled),
          memberAutoTranslate: data.memberAutoTranslateEnabled !== false,
          memberTranslateLang: lang,
          effectiveLangLabel: label,
        });
        if (lang) void writeLocalGroupTranslateLang(id, lang);
      }
    } catch { }
  }, [id, user?.dbId, user?.sessionToken]);

  const refreshScreenData = useCallback(() => {
    if (!id) return;
    lastRefreshAtRef.current = Date.now();
    const likelyGroup = chat?.isGroup ?? getGroupInfoCache(id)?.isGroup ?? serverIsGroup ?? false;
    void (async () => {
      await Promise.all([
        fetchChatDetails(),
        likelyGroup ? fetchMembers() : Promise.resolve(),
        likelyGroup && user?.dbId ? fetchTranslationSettings() : fetchContactInfo(),
      ]);
      void fetchMedia();
    })();
  }, [
    id,
    chat?.isGroup,
    serverIsGroup,
    user?.dbId,
    fetchChatDetails,
    fetchMembers,
    fetchTranslationSettings,
    fetchMedia,
    fetchContactInfo,
  ]);

  useEffect(() => {
    if (!id) return;
    const cached = getGroupInfoCache(id);
    if (cached) {
      setMembers(cached.members);
      setIsAdmin(cached.isAdmin);
      setServerIsGroup(cached.isGroup);
      setGroupDesc(cached.groupDesc);
      setDescInput(cached.groupDesc);
      setDisappearing(cached.disappearing);
      setGroupMessagingPolicy(cached.groupMessagingPolicy);
      setAutoTranslateEnabled(cached.autoTranslateEnabled);
      setMemberAutoTranslate(cached.memberAutoTranslate);
      setMemberTranslateLang(cached.memberTranslateLang);
      setEffectiveLangLabel(cached.effectiveLangLabel);
    } else if (chat?.isGroup) {
      setServerIsGroup(true);
      setAutoTranslateEnabled(chat.autoTranslateEnabled ?? false);
    }
    void readLocalGroupTranslateLang(id).then((localLang) => {
      if (!localLang) return;
      setMemberTranslateLang(localLang);
      setEffectiveLangLabel(languageNativeLabel(localLang));
    });
  }, [id, chat?.isGroup, chat?.autoTranslateEnabled]);

  useEffect(() => {
    if (chat?.disappearAfterSeconds !== undefined) {
      setDisappearing(chat.disappearAfterSeconds ?? null);
    }
  }, [chat?.disappearAfterSeconds]);

  useFocusEffect(
    useCallback(() => {
      const cached = id ? getGroupInfoCache(id) : null;
      const stale = Date.now() - lastRefreshAtRef.current > 12_000;
      if (!cached || stale) {
        refreshScreenData();
      } else {
        void (async () => {
          const likelyGroup = chat?.isGroup ?? cached.isGroup;
          await Promise.all([
            fetchChatDetails(),
            likelyGroup ? fetchMembers() : Promise.resolve(),
            likelyGroup && user?.dbId ? fetchTranslationSettings() : Promise.resolve(),
          ]);
        })();
      }
    }, [id, chat?.isGroup, user?.dbId, refreshScreenData, fetchChatDetails, fetchMembers, fetchTranslationSettings]),
  );

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

  const doReport = () => {
    const targetId = chatOtherUserId.current;
    if (isGroup || !targetId) {
      Alert.alert("Report", "Your report has been submitted.");
      return;
    }
    Alert.alert(`Report ${name ?? "contact"}?`, "The latest messages from this chat may be reviewed. This contact will not be notified.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        onPress: async () => {
          await reportUser(targetId, { chatId: id, reason: "reported_contact" });
          Alert.alert("Report sent", "Thank you. We will review this contact.");
        },
      },
      {
        text: "Report and block",
        style: "destructive",
        onPress: async () => {
          await reportUser(targetId, { chatId: id, reason: "reported_and_blocked", block: true });
          setIsBlocked(true);
          Alert.alert("Reported and blocked", "This contact can no longer call or message you.");
        },
      },
    ]);
  };

  const doArchive = () => {
    Alert.alert("Archive chat?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", onPress: () => { archiveChat(id!, true); router.replace("/(tabs)/chats"); } },
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
    if (!addMemberModal) return;
    let cancelled = false;
    setAddPickLoading(true);
    setAddPickPermissionDenied(false);
    void (async () => {
      try {
        if (Platform.OS === "web") {
          const { chatsToWebMembers } = await import("@/lib/web/webContacts");
          const candidates = chatsToWebMembers(chatsRef.current, user?.dbId)
            .filter((m) => !members.some((gm) => gm.id === m.id))
            .map((m) => ({ id: `videh_${m.id}`, name: m.name, phone: m.phone ?? "" }));
          if (!cancelled) setAddPickRows(candidates);
          return;
        }
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
  }, [addMemberModal, members, user?.dbId]);

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

  const disappearLabel = disappearTimerLabel(disappearing);

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
        headers: authedJsonHeaders(),
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

  const toggleGroupAutoTranslate = async (enabled: boolean) => {
    if (!isAdmin) {
      Alert.alert("Admin only", "Only a group admin can turn auto-translate on or off.");
      return;
    }
    if (!user?.sessionToken) {
      Alert.alert("Sign in required", "Please sign in again to change this setting.");
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/auto-translate`, {
        method: "PUT",
        headers: authedJsonHeaders(),
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoTranslateEnabled(enabled);
        patchChatInList(id!, { autoTranslateEnabled: enabled });
        void loadMessages(id!);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Could not update", data.message ?? "Only admins can change this setting.");
      }
    } catch {
      Alert.alert("Error", "Could not update auto-translate setting.");
    }
  };

  const persistMemberTranslation = async (patch: { translateLang?: string | null; personalEnabled?: boolean }) => {
    if (!user?.dbId) {
      Alert.alert("Sign in required", "Please sign in again to save language settings.");
      return;
    }
    if (patch.translateLang !== undefined) {
      setMemberTranslateLang(patch.translateLang);
      const label =
        patch.translateLang
          ? languageNativeLabel(patch.translateLang)
          : `App default (${effectiveLangLabel})`;
      setEffectiveLangLabel(label);
      if (id) {
        void writeLocalGroupTranslateLang(id, patch.translateLang);
        patchGroupInfoCache(id, {
          memberTranslateLang: patch.translateLang,
          effectiveLangLabel: label,
        });
      }
    }
    if (patch.personalEnabled !== undefined) {
      setMemberAutoTranslate(patch.personalEnabled);
    }
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/translation-settings`, {
        method: "PUT",
        headers: authedJsonHeaders(),
        body: JSON.stringify({
          userId: user.dbId,
          translateLang: patch.translateLang,
          personalEnabled: patch.personalEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (patch.translateLang !== undefined) {
          setMemberTranslateLang(patch.translateLang);
          if (id) void writeLocalGroupTranslateLang(id, patch.translateLang);
        }
        if (patch.personalEnabled !== undefined) setMemberAutoTranslate(patch.personalEnabled);
        const label = data.effectiveLangName ?? languageNativeLabel(data.effectiveLang);
        setEffectiveLangLabel(label);
        if (id) {
          patchGroupInfoCache(id, {
            memberTranslateLang: patch.translateLang !== undefined ? patch.translateLang : undefined,
            memberAutoTranslate:
              patch.personalEnabled !== undefined ? patch.personalEnabled : undefined,
            effectiveLangLabel: label,
          });
        }
        void loadMessages(id!);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Could not save", data.message ?? "Try again.");
      }
    } catch {
      Alert.alert("Error", "Could not save your language preference.");
    }
  };

  const openGroupLanguagePicker = () => {
    setGroupLangPickerOpen(true);
  };

  const selectGroupLanguage = (code: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGroupLangPickerOpen(false);
    void persistMemberTranslation({ translateLang: code });
  };

  const pickGroupPhoto = async () => {
    if (!isGroup || !isAdmin || !id || groupAvatarUploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Permission required", "Photo library access is required to set a group photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setGroupAvatarUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateGroupAvatar(id, result.assets[0].uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Could not update", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setGroupAvatarUploading(false);
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
        headers: authedJsonHeaders(),
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
    if (!id || !user?.dbId || descSaving) return;
    const next = descInput.trim();
    if (next.length > 512) {
      Alert.alert("Too long", "Group description must be 512 characters or less.");
      return;
    }
    setDescSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/chats/${id}/description`, {
        method: "PUT", headers: authedJsonHeaders(),
        body: JSON.stringify({ description: next, requesterId: user.dbId }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string; groupDescription?: string };
      if (!res.ok || !data.success) {
        Alert.alert("Could not save", data.message ?? "Please try again.");
        return;
      }
      const saved = data.groupDescription ?? next;
      setGroupDesc(saved);
      setDescInput(saved);
      setEditingDesc(false);
    } catch {
      Alert.alert("Network error", "Could not save group description.");
    } finally {
      setDescSaving(false);
    }
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
        method: "POST", headers: authedJsonHeaders(),
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
              method: "DELETE", headers: authedJsonHeaders(),
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
                method: "PUT", headers: authedJsonHeaders(),
                body: JSON.stringify({ requesterId: user?.dbId, isAdmin: !member.is_admin }),
              });
              fetchMembers();
            } catch { }
          }
        }
      ]
    );
  };

  const openMemberProfile = (member: GroupMember) => {
    if (member.id === user?.dbId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setProfileMember(member);
  };

  const openMemberMenu = (member: GroupMember) => {
    if (member.id === user?.dbId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMember(member);
    setMemberMenuVisible(true);
  };

  const downloadProfilePhoto = async (uri: string) => {
    const res = await saveImageUriToLibrary(uri, user?.sessionToken);
    Alert.alert(res.ok ? "Saved" : "Error", res.ok ? (Platform.OS === "web" ? "Photo downloaded." : "Photo saved to gallery.") : res.message);
  };

  const goToChat = async (member: GroupMember) => {
    setMemberMenuVisible(false);
    const chatId = await createDirectChat(member.id, member.name, member.avatar_url);
    router.push({ pathname: "/chat/[id]", params: { id: chatId, name: member.name } });
  };

  const getLastSeenText = (m: GroupMember) =>
    formatPresenceSubtitle({
      canSee: true,
      isOnline: m.is_online,
      lastSeen: m.last_seen ?? null,
    }) || "last seen recently";

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
          <TouchableOpacity
            onPress={() => {
              if (isGroup && isAdmin) void pickGroupPhoto();
              else setPhotoVisible(true);
            }}
            activeOpacity={0.85}
            style={styles.bigAvatarShell}
          >
            {chat?.avatar ? (
              <Image source={{ uri: chat.avatar }} style={styles.bigAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.bigAvatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.bigAvatarText}>{initials}</Text>
              </View>
            )}
            {groupAvatarUploading ? (
              <View style={styles.avatarUploadOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            {isGroup && isAdmin ? (
              <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="camera" size={16} color="#fff" />
              </View>
            ) : null}
            {isChatDisappearingEnabled(disappearing) ? <DisappearTimerBadge size={22} variant="profile" /> : null}
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
          <>
            {otherContact?.phone ? (
              <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionLabel, { color: colors.primary }]}>Phone</Text>
                <Text style={[styles.sectionValue, { color: colors.foreground }]}>{otherContact.phone}</Text>
              </View>
            ) : null}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>About</Text>
              <Text style={[styles.sectionValue, { color: colors.foreground }]}>{aboutText}</Text>
            </View>
          </>
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
                  maxLength={512}
                />
                <View style={styles.descBtns}>
                  <Text style={[styles.descCounter, { color: colors.mutedForeground }]}>
                    {descInput.trim().length}/512
                  </Text>
                  <TouchableOpacity
                    onPress={() => { setEditingDesc(false); setDescInput(groupDesc); }}
                    style={styles.descBtn}
                    disabled={descSaving}
                  >
                    <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveGroupDesc}
                    style={[styles.descBtn, { backgroundColor: colors.primary, opacity: descSaving ? 0.65 : 1 }]}
                    disabled={descSaving}
                  >
                    {descSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: "#fff" }}>Save</Text>
                    )}
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
          <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setMediaGalleryOpen(true)} activeOpacity={0.8}>
            <Text style={[styles.sectionLabel, { color: colors.primary, marginBottom: 0 }]}>Media, Links, and Docs</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {mediaTotalCount > 0 ? (
                <Text style={[styles.seeAll, { color: colors.primary }]}>{mediaTotalCount}</Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.primary} style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>
          {mediaMessages.length > 0 ? (
            <TouchableOpacity style={styles.mediaGrid} onPress={() => setMediaGalleryOpen(true)} activeOpacity={0.9}>
              {mediaMessages.map((m) => (
                <View key={m.id} style={[styles.mediaThumbnail, { backgroundColor: colors.muted }]}>
                  {m.type === "image" && m.media_url ? (
                    <Image source={mediaImageSource(m.media_url)} style={styles.mediaThumbnailImg} contentFit="cover" />
                  ) : m.type === "document" ? (
                    <View style={[styles.mediaThumbnail, { alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="document-text" size={24} color={colors.mutedForeground} />
                    </View>
                  ) : (
                    <View style={[styles.mediaThumbnail, { alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="videocam" size={24} color={colors.mutedForeground} />
                    </View>
                  )}
                </View>
              ))}
              {mediaTotalCount > 9 ? (
                <View style={[styles.mediaThumbnail, { backgroundColor: colors.muted + "cc", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={[styles.moreMediaText, { color: colors.foreground }]}>+{mediaTotalCount - 9}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
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
            icon="color-palette-outline"
            iconBg="#E91E63"
            label="Chat theme"
            value="Accent, bubbles & background"
            colors={colors}
            onPress={() =>
              router.push({
                pathname: "/settings/chat-theme",
                params: { chatId: id!, name: name ?? "Chat" },
              } as unknown as Href)
            }
          />
          <InfoRow
            icon="musical-notes-outline"
            iconBg="#7C4DFF"
            label="Custom notification sound"
            value="Romantic, VIP, office & more"
            colors={colors}
            onPress={() =>
              router.push({
                pathname: "/settings/chat-sound/[chatId]",
                params: { chatId: id!, name: name ?? "Chat" },
              } as unknown as Href)
            }
          />
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
            onPress={() =>
              router.push({
                pathname: "/disappearing-messages/[id]",
                params: { id: id! },
              })
            }
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
          {isGroup && (
            <InfoRow
              icon="language-outline"
              iconBg="#7E57C2"
              label="Translation in group"
              value={autoTranslateEnabled ? "On — each member, their language" : "Off"}
              colors={colors}
              right={
                isAdmin ? (
                  <Switch
                    value={autoTranslateEnabled}
                    onValueChange={(v) => { void toggleGroupAutoTranslate(v); }}
                    thumbColor={autoTranslateEnabled ? colors.primary : "#f4f3f4"}
                    trackColor={{ true: colors.primary + "80", false: colors.border }}
                  />
                ) : undefined
              }
            />
          )}
          {isGroup && (
            <InfoRow
              icon="globe-outline"
              iconBg="#5C6BC0"
              label="Your reading language"
              value={memberTranslateLang ? languageNativeLabel(memberTranslateLang) : `App default (${effectiveLangLabel})`}
              colors={colors}
              onPress={openGroupLanguagePicker}
            />
          )}
          {isGroup && (
            <InfoRow
              icon="text-outline"
              iconBg="#26A69A"
              label="Show translated messages"
              value={memberAutoTranslate ? "On" : "Original only"}
              colors={colors}
              right={
                <Switch
                  value={memberAutoTranslate}
                  onValueChange={(v) => { void persistMemberTranslation({ personalEnabled: v }); }}
                  thumbColor={memberAutoTranslate ? colors.primary : "#f4f3f4"}
                  trackColor={{ true: colors.primary + "80", false: colors.border }}
                />
              }
            />
          )}
          <InfoRow
            icon="lock-closed-outline"
            iconBg="#4CAF50"
            label="Encryption"
            value="Messages are protected in transit (TLS)"
            colors={colors}
            onPress={() => Alert.alert("Transport security", "Messages and calls use TLS encryption between your device and Videh servers. Content is stored on Videh servers to sync chats and linked devices.")}
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
            {loadingMembers && members.length === 0 ? (
              <View style={styles.membersLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
            {members.map((m) => {
              const mInitials = (m.name || "?").slice(0, 2).toUpperCase();
              const mHue = ((m.name ?? "?").charCodeAt(0) * 37) % 360;
              const isMe = Number(m.id) === Number(user?.dbId);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberRow, { borderBottomColor: colors.border }]}
                  onPress={() => !isMe && openMemberProfile(m)}
                  onLongPress={() => !isMe && isAdmin && openMemberMenu(m)}
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
                    <View style={[styles.onlineDot, { backgroundColor: m.is_online ? "#7C6CF0" : "transparent", borderColor: m.is_online ? "transparent" : colors.border }]} />
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
                    method: "DELETE", headers: authedJsonHeaders(),
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
          <TouchableOpacity style={[styles.dangerRow, { borderTopWidth: 0.5, borderTopColor: colors.border }]} onPress={doReport} activeOpacity={0.7}>
            <Ionicons name="flag-outline" size={20} color={colors.destructive} />
            <Text style={[styles.dangerText, { color: colors.destructive }]}>Report {isGroup ? "group" : name}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Profile Photo Fullscreen — tap outside / back closes */}
      <Modal visible={photoVisible} transparent animationType="fade" onRequestClose={() => setPhotoVisible(false)}>
        <Pressable style={styles.photoModal} onPress={() => setPhotoVisible(false)}>
          <View style={styles.photoTopBar}>
            <TouchableOpacity style={styles.photoClose} onPress={() => setPhotoVisible(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {chat?.avatar ? (
              <TouchableOpacity
                onPress={() => void downloadProfilePhoto(chat.avatar!)}
                style={styles.photoClose}
                activeOpacity={0.8}
              >
                <Ionicons name={Platform.OS === "web" ? "download-outline" : "save-outline"} size={26} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
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

      <Modal visible={!!mediaPreviewUri} transparent animationType="fade" onRequestClose={() => setMediaPreviewUri(null)}>
        <Pressable style={styles.photoModal} onPress={() => setMediaPreviewUri(null)}>
          <TouchableOpacity style={styles.photoClose} onPress={() => setMediaPreviewUri(null)} activeOpacity={0.8}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {mediaPreviewUri ? (
            <Image source={mediaImageSource(mediaPreviewUri)} style={styles.photoFull} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>

      {/* Group language picker — full screen list (Alert only shows ~3 on Android) */}
      <DismissibleModal visible={groupLangPickerOpen} onClose={() => setGroupLangPickerOpen(false)} animationType="slide">
        <View style={[styles.langPickerScreen, { backgroundColor: colors.background, paddingTop: topPad }]}>
          <View style={[styles.langPickerHeader, { backgroundColor: colors.headerBg }]}>
            <TouchableOpacity onPress={() => setGroupLangPickerOpen(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.langPickerHeaderTitle}>Your language in this group</Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={[styles.langPickerHint, { color: colors.mutedForeground }]}>
            Messages from others will appear in this language when auto-translate is on. Links, emails, and phone numbers stay as-is.
          </Text>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={[styles.langPickerRow, { borderBottomColor: colors.border }]}
                onPress={() => selectGroupLanguage(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.langPickerNative, { color: colors.foreground }]}>App default</Text>
                <Text style={[styles.langPickerName, { color: colors.mutedForeground }]}>Use language from Settings</Text>
                {!memberTranslateLang && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.langPickerCheck} />
                )}
              </TouchableOpacity>
              {INDIAN_LANGUAGE_OPTIONS.map((lang, i) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.langPickerRow,
                    i < INDIAN_LANGUAGE_OPTIONS.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border },
                  ]}
                  onPress={() => selectGroupLanguage(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.langPickerNative, { color: colors.foreground }]}>{lang.native}</Text>
                  <Text style={[styles.langPickerName, { color: colors.mutedForeground }]}>{lang.name}</Text>
                  {memberTranslateLang === lang.code && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.langPickerCheck} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
                      ? "Pick someone you chat with, or search by phone above."
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

      <MemberProfileSheet
        visible={!!profileMember}
        member={profileMember}
        colors={colors}
        isGroupContext={isGroup}
        showAdminActions={isAdmin}
        onClose={() => setProfileMember(null)}
        onMessage={() => {
          if (profileMember) void goToChat(profileMember);
          setProfileMember(null);
        }}
        onAudioCall={
          profileMember
            ? () => {
                setProfileMember(null);
                void createDirectChat(profileMember.id, profileMember.name, profileMember.avatar_url).then((cid) => {
                  router.push({ pathname: "/call/[id]", params: { id: cid, name: profileMember.name, type: "audio" } });
                });
              }
            : undefined
        }
        onVideoCall={
          profileMember
            ? () => {
                setProfileMember(null);
                void createDirectChat(profileMember.id, profileMember.name, profileMember.avatar_url).then((cid) => {
                  router.push({ pathname: "/call/[id]", params: { id: cid, name: profileMember.name, type: "video" } });
                });
              }
            : undefined
        }
        onViewPhoto={() => {
          if (profileMember?.avatar_url) {
            setMediaPreviewUri(profileMember.avatar_url);
          }
        }}
        onMoreOptions={() => {
          if (profileMember) {
            setProfileMember(null);
            openMemberMenu(profileMember);
          }
        }}
      />

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

      {id ? (
        <ChatMediaGalleryModal
          visible={mediaGalleryOpen}
          chatId={id}
          chatName={name}
          onClose={() => setMediaGalleryOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 12, backgroundColor: "#5B4FE8" },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff", marginLeft: 8 },
  headerBtn: { padding: 8 },

  profileBlock: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 16, marginBottom: 8 },
  bigAvatarShell: { position: "relative", alignSelf: "center" },
  avatarEditBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  descBtns: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 },
  descCounter: { marginRight: "auto", fontSize: 11 },
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
  membersLoading: { paddingVertical: 20, alignItems: "center" },
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
  photoTopBar: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  photoClose: { padding: 8 },
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

  langPickerScreen: { flex: 1 },
  langPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  langPickerHeaderTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  langPickerHint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "Inter_400Regular" },
  langPickerRow: { paddingVertical: 14, paddingRight: 40 },
  langPickerNative: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  langPickerName: { fontSize: 13, marginTop: 2, fontFamily: "Inter_400Regular" },
  langPickerCheck: { position: "absolute", right: 0, top: 16 },
});
