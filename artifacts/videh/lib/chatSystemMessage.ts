export type DisappearSystemPayload = {
  kind: "disappear_timer";
  seconds: number | null;
};

export type PromotedAdminPayload = {
  kind: "promoted_admin";
  targetUserId: number;
  targetUserName?: string;
};

export type BusinessMarketingStoppedPayload = {
  kind: "business_marketing_stopped";
  businessName: string;
  businessUserId?: number;
};

export type BusinessMarketingResumedPayload = {
  kind: "business_marketing_resumed";
  businessName: string;
  businessUserId?: number;
};

export type GroupCreatedPayload = {
  kind: "group_created";
  actorUserId: number;
  actorUserName?: string;
  groupName: string;
};

export type MemberAddedPayload = {
  kind: "member_added";
  actorUserId: number;
  actorUserName?: string;
  targetUserId: number;
  targetUserName?: string;
};

export type MemberJoinedPayload = {
  kind: "member_joined";
  userId: number;
  userName?: string;
  viaInvite?: boolean;
};

export type MemberLeftPayload = {
  kind: "member_left";
  userId: number;
  userName?: string;
};

export type MemberRemovedPayload = {
  kind: "member_removed";
  actorUserId: number;
  actorUserName?: string;
  targetUserId: number;
  targetUserName?: string;
};

export type ChatSystemPayload =
  | DisappearSystemPayload
  | PromotedAdminPayload
  | BusinessMarketingStoppedPayload
  | BusinessMarketingResumedPayload
  | GroupCreatedPayload
  | MemberAddedPayload
  | MemberJoinedPayload
  | MemberLeftPayload
  | MemberRemovedPayload;

export function parseChatSystemPayload(text: string): ChatSystemPayload | null {
  const raw = (text ?? "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as ChatSystemPayload;
    if (parsed?.kind === "disappear_timer") return parsed;
    if (parsed?.kind === "promoted_admin" && typeof parsed.targetUserId === "number") return parsed;
    if (
      (parsed?.kind === "business_marketing_stopped" || parsed?.kind === "business_marketing_resumed")
      && typeof (parsed as BusinessMarketingStoppedPayload).businessName === "string"
    ) {
      return parsed;
    }
    if (parsed?.kind === "group_created" && typeof parsed.actorUserId === "number") return parsed;
    if (parsed?.kind === "member_added" && typeof parsed.actorUserId === "number" && typeof parsed.targetUserId === "number") {
      return parsed;
    }
    if (parsed?.kind === "member_joined" && typeof parsed.userId === "number") return parsed;
    if (parsed?.kind === "member_left" && typeof parsed.userId === "number") return parsed;
    if (parsed?.kind === "member_removed" && typeof parsed.actorUserId === "number" && typeof parsed.targetUserId === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** @deprecated use parseChatSystemPayload */
export function parseDisappearSystemPayload(text: string): DisappearSystemPayload | null {
  const p = parseChatSystemPayload(text);
  return p?.kind === "disappear_timer" ? p : null;
}

export function disappearDurationPhrase(seconds: number): string {
  if (seconds === 86400) return "24 hours";
  if (seconds === 604800) return "7 days";
  if (seconds === 7776000) return "90 days";
  return "a set time";
}

export function disappearSystemMessageCopy(seconds: number | null): {
  body: string;
  showChangeLink: boolean;
} {
  if (!seconds || seconds <= 0) {
    return { body: "You turned off disappearing messages.", showChangeLink: false };
  }
  const duration = disappearDurationPhrase(seconds);
  return {
    body: `The message timer was updated. New messages will disappear from this chat ${duration} after they're sent, except when kept.`,
    showChangeLink: true,
  };
}

export function isDisappearTimerSystemMessage(text: string): boolean {
  return parseDisappearSystemPayload(text) != null;
}

export function promotedAdminMessageCopy(
  payload: PromotedAdminPayload,
  viewerUserId?: number,
): string {
  if (viewerUserId != null && viewerUserId === payload.targetUserId) {
    return "You're now an admin";
  }
  const name = payload.targetUserName?.trim();
  return name ? `${name} is now an admin` : "A member is now an admin";
}

export function businessMarketingStoppedCopy(businessName: string): string {
  const name = businessName.trim() || "this business";
  return `Offers and announcements from ${name} stopped.`;
}

export function businessMarketingResumedCopy(businessName: string): string {
  const name = businessName.trim() || "this business";
  return `Offers and announcements from ${name} resumed.`;
}

function displayName(name: string | undefined, fallback: string): string {
  const n = name?.trim();
  return n || fallback;
}

export function groupCreatedMessageCopy(payload: GroupCreatedPayload, viewerUserId?: number): string {
  const groupName = payload.groupName?.trim() || "this group";
  if (viewerUserId != null && viewerUserId === payload.actorUserId) {
    return `You created group "${groupName}"`;
  }
  const actor = displayName(payload.actorUserName, "Someone");
  return `${actor} created group "${groupName}"`;
}

export function memberAddedMessageCopy(payload: MemberAddedPayload, viewerUserId?: number): string {
  const actor = displayName(payload.actorUserName, "Someone");
  const target = displayName(payload.targetUserName, "a member");
  if (viewerUserId != null && viewerUserId === payload.actorUserId) {
    return `You added ${target}`;
  }
  if (viewerUserId != null && viewerUserId === payload.targetUserId) {
    return `${actor} added you`;
  }
  return `${actor} added ${target}`;
}

export function memberJoinedMessageCopy(payload: MemberJoinedPayload, viewerUserId?: number): string {
  const name = displayName(payload.userName, "Someone");
  if (viewerUserId != null && viewerUserId === payload.userId) {
    return payload.viaInvite
      ? "You joined using this group's invite link"
      : "You joined";
  }
  return payload.viaInvite
    ? `${name} joined using this group's invite link`
    : `${name} joined`;
}

export function memberLeftMessageCopy(payload: MemberLeftPayload, viewerUserId?: number): string {
  if (viewerUserId != null && viewerUserId === payload.userId) {
    return "You left";
  }
  const name = displayName(payload.userName, "Someone");
  return `${name} left`;
}

export function memberRemovedMessageCopy(payload: MemberRemovedPayload, viewerUserId?: number): string {
  const actor = displayName(payload.actorUserName, "Someone");
  const target = displayName(payload.targetUserName, "a member");
  if (viewerUserId != null && viewerUserId === payload.actorUserId) {
    return `You removed ${target}`;
  }
  if (viewerUserId != null && viewerUserId === payload.targetUserId) {
    return `${actor} removed you`;
  }
  return `${actor} removed ${target}`;
}
