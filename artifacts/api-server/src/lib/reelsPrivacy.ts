/** Video/Reels identity is @handle only — never expose messenger phone numbers. */

const INDIAN_MOBILE_RE = /(?:\+?91[\s.-]?)?[6-9]\d{9}/g;
const GENERIC_PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4,}/g;

export function digitsOnly(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** True when a search/display string is mostly a phone number. */
export function isPhoneLikeQuery(raw: string): boolean {
  const digits = digitsOnly(raw);
  if (digits.length >= 10 && digits.length <= 13) return true;
  return INDIAN_MOBILE_RE.test(raw) || /^\d{10,15}$/.test(digits);
}

/** True when a display name is (or contains) a phone number. */
export function isPhoneLikeDisplayName(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  const digits = digitsOnly(s);
  if (digits.length >= 10 && digits.length <= 15 && digits.length >= s.replace(/\s/g, "").length * 0.7) {
    return true;
  }
  return INDIAN_MOBILE_RE.test(s) || GENERIC_PHONE_RE.test(s);
}

/** Remove phone numbers from text shown on the Video platform. */
export function redactPhoneNumbersInText(raw: string): string {
  const s = String(raw ?? "");
  if (!s) return s;
  return s
    .replace(INDIAN_MOBILE_RE, "[number hidden]")
    .replace(GENERIC_PHONE_RE, "[number hidden]");
}

export function reelsVideoDisplayName(handle: string | null | undefined): string {
  const h = String(handle ?? "").trim().replace(/^@+/, "");
  return h ? `@${h}` : "Videh viewer";
}

export function mapPublicReelsChannel(
  row: Record<string, unknown>,
  viewerId?: number,
): Record<string, unknown> {
  const isOwner = viewerId != null && viewerId > 0 && Number(row.user_id) === viewerId;
  const base: Record<string, unknown> = {
    id: row.id,
    handle: row.handle,
    avatarUrl: row.avatar_url ?? null,
    coverUrl: row.cover_url ?? null,
    bio: row.bio ? redactPhoneNumbersInText(String(row.bio)) : null,
    subscriberCount: Number(row.subscriber_count ?? 0),
    totalViews: Number(row.total_views ?? 0),
    totalViewHours: Number(row.total_view_hours ?? 0),
    totalLikes: Number(row.total_likes ?? 0),
    totalComments: Number(row.total_comments ?? 0),
    totalShares: Number(row.total_shares ?? 0),
    fraudScore: Number(row.fraud_score ?? 0),
    monetizationEligible: Boolean(row.monetization_eligible),
    monetizationStatus: row.monetization_status ?? "not_eligible",
    isSubscribed: Boolean(row.is_subscribed),
    isOwner,
    displayName: (() => {
      const custom = String(row.display_name ?? "").trim();
      if (custom && !isPhoneLikeDisplayName(custom)) {
        return redactPhoneNumbersInText(custom);
      }
      return reelsVideoDisplayName(String(row.handle ?? ""));
    })(),
    createdAt: row.created_at,
  };
  if (isOwner) base.userId = row.user_id;
  return base;
}

export function mapPublicReelsComment(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: Number(row.id),
    content: redactPhoneNumbersInText(String(row.content ?? "")),
    displayName: reelsVideoDisplayName(row.channel_handle as string | null | undefined),
    channelHandle: row.channel_handle ?? null,
    avatarUrl: row.avatar_url ?? null,
    createdAt: row.created_at,
    likeCount: Number(row.like_count ?? 0),
    replyCount: Number(row.reply_count ?? 0),
    myReaction: row.my_reaction ?? null,
    parentId: row.parent_id != null ? Number(row.parent_id) : null,
  };
}
