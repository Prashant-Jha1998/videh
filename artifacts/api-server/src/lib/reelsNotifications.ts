import { query } from "./db";
import { sendChatPushToMembers } from "./pushNotify";
import { getReelsPlatformConfig } from "./reelsConfig";

let tableEnsured = false;

export async function ensureReelsVideoNotificationsTable(): Promise<void> {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS reels_video_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      channel_id INTEGER NOT NULL REFERENCES reels_channels(id) ON DELETE CASCADE,
      kind VARCHAR(32) NOT NULL DEFAULT 'new_video',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, video_id, kind)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reels_video_notif_user_created
    ON reels_video_notifications (user_id, created_at DESC)
  `);
  tableEnsured = true;
}

async function insertInAppNotifications(
  channelId: number,
  videoId: number,
  subscriberUserIds: number[],
): Promise<void> {
  if (!subscriberUserIds.length) return;
  await ensureReelsVideoNotificationsTable();
  for (const userId of subscriberUserIds) {
    await query(
      `INSERT INTO reels_video_notifications (user_id, video_id, channel_id, kind)
       VALUES ($1, $2, $3, 'new_video')
       ON CONFLICT (user_id, video_id, kind) DO NOTHING`,
      [userId, videoId, channelId],
    );
  }
}

export async function notifySubscribersNewVideo(
  channelId: number,
  videoId: number,
  title: string,
  channelHandle: string,
): Promise<number> {
  const cfg = await getReelsPlatformConfig();

  const subs = await query(
    `SELECT s.subscriber_user_id AS user_id, u.push_token
     FROM reels_subscriptions s
     JOIN users u ON u.id = s.subscriber_user_id
     WHERE s.channel_id = $1`,
    [channelId],
  );

  const subscriberIds = subs.rows.map((r) => Number(r.user_id)).filter((id) => id > 0);
  void insertInAppNotifications(channelId, videoId, subscriberIds);

  if (!cfg.notifications.notifySubscribersOnNewVideo) return subscriberIds.length;

  const members = subs.rows
    .filter((r) => r.push_token && String(r.push_token).trim())
    .map((r) => ({
      user_id: Number(r.user_id),
      push_token: r.push_token as string | null,
    }));
  if (!members.length) return subscriberIds.length;

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
  return subscriberIds.length;
}

export type ReelsVideoNotificationRow = {
  id: number;
  videoId: number;
  channelId: number;
  kind: string;
  readAt: string | null;
  createdAt: string;
  videoTitle: string;
  videoThumbnailUrl: string | null;
  channelHandle: string | null;
  channelDisplayName: string | null;
  channelAvatarUrl: string | null;
  channelUpdatedAt: string | null;
};

export async function fetchReelsVideoNotifications(
  userId: number,
  limit = 50,
): Promise<ReelsVideoNotificationRow[]> {
  await ensureReelsVideoNotificationsTable();
  const res = await query(
    `SELECT n.id, n.video_id, n.channel_id, n.kind, n.read_at, n.created_at,
            v.title AS video_title, v.thumbnail_url, v.created_at AS video_created_at,
            c.handle AS channel_handle, c.display_name AS channel_display_name,
            c.avatar_url AS channel_avatar_url, c.updated_at AS channel_updated_at
     FROM reels_video_notifications n
     JOIN reels_videos v ON v.id = n.video_id
     JOIN reels_channels c ON c.id = n.channel_id
     WHERE n.user_id = $1
       AND v.status = 'published'
       AND v.play_enabled IS NOT FALSE
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, Math.min(100, Math.max(1, limit))],
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    videoId: Number(row.video_id),
    channelId: Number(row.channel_id),
    kind: String(row.kind ?? "new_video"),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at),
    videoTitle: String(row.video_title ?? ""),
    videoThumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    channelHandle: row.channel_handle ? String(row.channel_handle) : null,
    channelDisplayName: row.channel_display_name ? String(row.channel_display_name) : null,
    channelAvatarUrl: row.channel_avatar_url ? String(row.channel_avatar_url) : null,
    channelUpdatedAt: row.channel_updated_at ? String(row.channel_updated_at) : null,
  }));
}

export async function countUnreadReelsVideoNotifications(userId: number): Promise<number> {
  await ensureReelsVideoNotificationsTable();
  const res = await query(
    `SELECT COUNT(*)::int AS c
     FROM reels_video_notifications n
     JOIN reels_videos v ON v.id = n.video_id
     WHERE n.user_id = $1 AND n.read_at IS NULL
       AND v.status = 'published'
       AND v.play_enabled IS NOT FALSE`,
    [userId],
  );
  return Number(res.rows[0]?.c ?? 0);
}

export async function markReelsVideoNotificationsRead(
  userId: number,
  notificationIds?: number[],
): Promise<void> {
  await ensureReelsVideoNotificationsTable();
  if (notificationIds?.length) {
    await query(
      `UPDATE reels_video_notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE user_id = $1 AND id = ANY($2::int[])`,
      [userId, notificationIds],
    );
    return;
  }
  await query(
    `UPDATE reels_video_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
}

export async function hideReelsVideoNotification(userId: number, notificationId: number): Promise<boolean> {
  await ensureReelsVideoNotificationsTable();
  const res = await query(
    `DELETE FROM reels_video_notifications
     WHERE user_id = $1 AND id = $2
     RETURNING id`,
    [userId, notificationId],
  );
  return res.rows.length > 0;
}
