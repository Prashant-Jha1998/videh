import { query } from "./db";
import { sendChatPushToMembers } from "./pushNotify";
import { getReelsPlatformConfig } from "./reelsConfig";

export async function notifySubscribersNewVideo(
  channelId: number,
  videoId: number,
  title: string,
  channelHandle: string,
): Promise<number> {
  const cfg = await getReelsPlatformConfig();
  if (!cfg.notifications.notifySubscribersOnNewVideo) return 0;

  const subs = await query(
    `SELECT u.id AS user_id, u.push_token
     FROM reels_subscriptions s
     JOIN users u ON u.id = s.subscriber_user_id
     WHERE s.channel_id = $1 AND u.push_token IS NOT NULL AND TRIM(u.push_token) != ''`,
    [channelId],
  );

  const members = subs.rows.map((r) => ({
    user_id: Number(r.user_id),
    push_token: r.push_token as string | null,
  }));
  if (!members.length) return 0;

  const body = `@${channelHandle} posted: ${title.slice(0, 80)}`;
  await sendChatPushToMembers(
    members,
    "New video",
    body,
    {
      type: "reels_new_video",
      videoId: String(videoId),
      channelId: String(channelId),
      channelHandle,
      notificationKind: "reels_subscriber",
    },
    {
      isGroup: false,
      chatId: `reels-channel-${channelId}`,
      threadId: `reels-${channelId}`,
    },
  );
  return members.length;
}
