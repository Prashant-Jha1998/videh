/** In-memory cache so Group Info opens instantly (standard). */

export type CachedGroupMember = {
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

export type GroupInfoCacheEntry = {
  members: CachedGroupMember[];
  isAdmin: boolean;
  isGroup: boolean;
  groupDesc: string;
  disappearing: number | null;
  groupMessagingPolicy: "everyone" | "admins_only" | "allowlist";
  autoTranslateEnabled: boolean;
  memberAutoTranslate: boolean;
  memberTranslateLang: string | null;
  effectiveLangLabel: string;
  updatedAt: number;
};

const store = new Map<string, GroupInfoCacheEntry>();

export function getGroupInfoCache(chatId: string | undefined | null): GroupInfoCacheEntry | null {
  if (!chatId) return null;
  return store.get(String(chatId)) ?? null;
}

export function patchGroupInfoCache(
  chatId: string,
  patch: Partial<Omit<GroupInfoCacheEntry, "updatedAt">>,
): GroupInfoCacheEntry {
  const key = String(chatId);
  const prev = store.get(key);
  const next: GroupInfoCacheEntry = {
    members: patch.members ?? prev?.members ?? [],
    isAdmin: patch.isAdmin ?? prev?.isAdmin ?? false,
    isGroup: patch.isGroup ?? prev?.isGroup ?? true,
    groupDesc: patch.groupDesc ?? prev?.groupDesc ?? "",
    disappearing: patch.disappearing !== undefined ? patch.disappearing : (prev?.disappearing ?? null),
    groupMessagingPolicy: patch.groupMessagingPolicy ?? prev?.groupMessagingPolicy ?? "everyone",
    autoTranslateEnabled: patch.autoTranslateEnabled ?? prev?.autoTranslateEnabled ?? false,
    memberAutoTranslate: patch.memberAutoTranslate ?? prev?.memberAutoTranslate ?? true,
    memberTranslateLang:
      patch.memberTranslateLang !== undefined
        ? patch.memberTranslateLang
        : (prev?.memberTranslateLang ?? null),
    effectiveLangLabel: patch.effectiveLangLabel ?? prev?.effectiveLangLabel ?? "English",
    updatedAt: Date.now(),
  };
  store.set(key, next);
  return next;
}

export function setGroupInfoMembers(chatId: string, members: CachedGroupMember[], viewerDbId?: number): void {
  const me = viewerDbId != null ? members.find((m) => Number(m.id) === Number(viewerDbId)) : undefined;
  patchGroupInfoCache(chatId, {
    members,
    isAdmin: me ? Boolean(me.is_admin) : undefined,
    isGroup: true,
  });
}
