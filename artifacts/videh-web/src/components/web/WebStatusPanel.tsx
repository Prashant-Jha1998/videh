import { useMemo } from "react";
import type { WebStatus } from "../../lib/webApi";
import { Avatar, WA_BG, WA_GREEN, WA_MUTED, WA_TEXT } from "./webUiShared";

function formatStatusTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString();
}

export function WebStatusPanel({
  statuses,
  selfId,
  selfName,
  selfAvatar,
  onSelectUser,
}: {
  statuses: WebStatus[];
  selfId: number;
  selfName: string;
  selfAvatar?: string;
  onSelectUser: (userId: number) => void;
}) {
  const myStatuses = statuses.filter((s) => s.user_id === selfId);
  const byUser = useMemo(() => {
    const map = new Map<number, WebStatus[]>();
    for (const s of statuses) {
      if (s.user_id === selfId) continue;
      const list = map.get(s.user_id) ?? [];
      list.push(s);
      map.set(s.user_id, list);
    }
    return Array.from(map.entries()).map(([userId, items]) => ({
      userId,
      items,
      latest: items[0],
      hasUnviewed: items.some((i) => !i.viewed),
    }));
  }, [statuses, selfId]);

  return (
    <div
      style={{
        width: 380,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #e9edef",
        backgroundColor: "white",
        flexShrink: 0,
        height: "100%",
      }}
    >
      <div style={{ padding: "20px 20px 12px", backgroundColor: WA_BG }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: WA_TEXT }}>Status</h1>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => myStatuses.length && onSelectUser(selfId)}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", cursor: "pointer" }}
        >
          <Avatar
            name={selfName}
            url={selfAvatar}
            size={56}
            ring={myStatuses.length > 0 ? "viewed" : null}
          />
          <div>
            <div style={{ fontWeight: 500, fontSize: 16 }}>My status</div>
            <div style={{ fontSize: 13, color: WA_MUTED }}>
              {myStatuses.length > 0 ? formatStatusTime(myStatuses[0].created_at) : "Add a status from the Videh app"}
            </div>
          </div>
        </div>
        {byUser.length > 0 && (
          <div style={{ padding: "12px 20px 6px", fontSize: 14, color: WA_MUTED, fontWeight: 500 }}>Recent updates</div>
        )}
        {byUser.map(({ userId, latest, hasUnviewed }) => (
          <div
            key={userId}
            role="button"
            tabIndex={0}
            onClick={() => onSelectUser(userId)}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px", cursor: "pointer" }}
          >
            <Avatar
              name={latest.user_name}
              url={latest.user_avatar}
              size={56}
              ring={hasUnviewed ? "unviewed" : "viewed"}
            />
            <div>
              <div style={{ fontWeight: 500, fontSize: 16 }}>{latest.user_name}</div>
              <div style={{ fontSize: 13, color: WA_MUTED }}>{formatStatusTime(latest.created_at)}</div>
            </div>
          </div>
        ))}
        {byUser.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: WA_MUTED }}>
            <p style={{ fontSize: 15 }}>No status updates from contacts yet.</p>
            <p style={{ fontSize: 13 }}>Post a story from the Videh app on your phone.</p>
          </div>
        )}
      </div>
      <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: WA_MUTED, borderTop: "1px solid #e9edef" }}>
        🔒 Your status updates are end-to-end encrypted
      </div>
    </div>
  );
}
