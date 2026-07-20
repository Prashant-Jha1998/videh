import type { Message, Status } from "@/context/AppContext";
import { resolvePublicAssetUrl, withStatusMediaAuth } from "@/lib/publicAssetUrl";

export type StatusReplyMeta = {
  statusId: string;
  ownerId: string;
  ownerName: string;
  type: "text" | "image" | "video";
  mediaUrl?: string;
  content?: string;
  backgroundColor?: string;
};

export function statusReplyOwnerLabel(
  msg: Pick<Message, "statusReplyOwnerId" | "statusReplyOwnerName">,
  viewerDbId?: number,
): string {
  const ownerId = msg.statusReplyOwnerId;
  if (!ownerId) return "Status";
  if (viewerDbId != null && String(ownerId) === String(viewerDbId)) return "You";
  return msg.statusReplyOwnerName?.trim() || "Contact";
}

export function statusReplyPreviewSubtitle(
  type?: string,
  content?: string,
): string {
  if (type === "video") return "Video";
  if (type === "image") return "Photo";
  const text = content?.trim();
  if (text) return text.length > 48 ? `${text.slice(0, 45).trimEnd()}…` : text;
  return "Status";
}

export function statusReplyIconName(type?: string): "image-outline" | "videocam-outline" | "text-outline" {
  if (type === "video") return "videocam-outline";
  if (type === "image") return "image-outline";
  return "text-outline";
}

export function buildStatusViewRouteParams(
  statusId: string,
  ownerUserId: string,
  statuses: Status[],
  viewerDbId?: number,
): { ids: string; id: string } | null {
  const ownerKey =
    viewerDbId != null && String(ownerUserId) === String(viewerDbId)
      ? "me"
      : String(ownerUserId);
  const group = statuses
    .filter((s) => s.userId === ownerKey)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (group.some((s) => s.id === statusId)) {
    return { ids: group.map((s) => s.id).join(","), id: statusId };
  }
  const single = statuses.find((s) => s.id === statusId);
  if (single) return { ids: statusId, id: statusId };
  return null;
}

export function mapApiStatusRow(
  s: Record<string, unknown>,
  viewerDbId: number,
  viewerName?: string,
  viewerAvatar?: string,
  sessionToken?: string | null,
): Status {
  const userId = Number(s.user_id);
  const isMe = userId === viewerDbId;
  const rawMedia = s.media_url as string | undefined;
  return {
    id: String(s.id),
    userId: isMe ? "me" : String(userId),
    userName: isMe ? (viewerName ?? String(s.user_name ?? "You")) : String(s.user_name ?? "Unknown"),
    userAvatar: isMe
      ? (viewerAvatar ?? (s.user_avatar as string | undefined))
      : (s.user_avatar as string | undefined),
    content: String(s.content ?? ""),
    type: (s.type as Status["type"]) ?? "text",
    mediaUrl:
      withStatusMediaAuth(rawMedia, sessionToken, s.id)
      ?? resolvePublicAssetUrl(rawMedia)
      ?? rawMedia,
    timestamp: new Date(String(s.created_at)).getTime(),
    expiresAt: s.expires_at ? new Date(String(s.expires_at)).getTime() : undefined,
    viewed: Boolean(s.viewed),
    backgroundColor: (s.background_color as string | undefined) ?? "#059669",
  };
}

export function messageFromStatusReplyMeta(meta: StatusReplyMeta): Pick<
  Message,
  | "statusReplyId"
  | "statusReplyOwnerId"
  | "statusReplyOwnerName"
  | "statusReplyType"
  | "statusReplyMediaUrl"
  | "statusReplyContent"
  | "statusReplyBackgroundColor"
> {
  return {
    statusReplyId: meta.statusId,
    statusReplyOwnerId: meta.ownerId,
    statusReplyOwnerName: meta.ownerName,
    statusReplyType: meta.type,
    statusReplyMediaUrl: meta.mediaUrl,
    statusReplyContent: meta.content,
    statusReplyBackgroundColor: meta.backgroundColor,
  };
}
