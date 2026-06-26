import { useRef, useState } from "react";
import { Camera, PenLine, X } from "lucide-react";
import { webApi, type WebStatus } from "../../lib/webApi";
import { Avatar } from "./webUiShared";

const TEXT_BG_COLORS = [
  "#5B4FE8", "#128C7E", "#075E54", "#2563EB", "#7C3AED", "#DB2777",
  "#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#0891B2", "#374151",
];

function formatStatusTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString();
}

function StatusComposeModal({
  token,
  onClose,
  onPosted,
}: {
  token: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(TEXT_BG_COLORS[0]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMode("photo");
  };

  const post = async () => {
    if (posting) return;
    if (mode === "text" && !text.trim()) {
      alert("Write something for your status.");
      return;
    }
    if (mode === "photo" && !selectedFile) {
      alert("Choose a photo first.");
      return;
    }
    setPosting(true);
    try {
      if (mode === "text") {
        await webApi.createStatus(token, {
          content: text.trim(),
          type: "text",
          backgroundColor: bgColor,
        });
      } else if (selectedFile) {
        const upload = await webApi.uploadStatusMedia(token, selectedFile);
        await webApi.createStatus(token, {
          content: text.trim() || "📷 Photo",
          type: "image",
          backgroundColor: bgColor,
          mediaUrl: upload.url,
        });
      }
      onPosted();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not post status.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="vw-status-compose-overlay" onClick={onClose}>
      <div className="vw-status-compose" onClick={(e) => e.stopPropagation()}>
        <div className="vw-status-compose__head">
          <h2>Add status</h2>
          <button type="button" className="vw-status-compose__close" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="vw-status-compose__tabs">
          <button
            type="button"
            className={mode === "text" ? "vw-status-compose__tab--active" : ""}
            onClick={() => setMode("text")}
          >
            <PenLine size={16} /> Text
          </button>
          <button
            type="button"
            className={mode === "photo" ? "vw-status-compose__tab--active" : ""}
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={16} /> Photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickPhoto(e.target.files?.[0])}
          />
        </div>

        {mode === "text" ? (
          <div className="vw-status-compose__preview" style={{ backgroundColor: bgColor }}>
            <textarea
              className="vw-status-compose__text"
              placeholder="Type a status update…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={700}
            />
          </div>
        ) : (
          <div className="vw-status-compose__preview vw-status-compose__preview--photo">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" />
            ) : (
              <button type="button" className="vw-status-compose__pick" onClick={() => fileRef.current?.click()}>
                Choose a photo
              </button>
            )}
            {previewUrl ? (
              <input
                className="vw-status-compose__caption"
                placeholder="Add a caption (optional)"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            ) : null}
          </div>
        )}

        {mode === "text" ? (
          <div className="vw-status-compose__colors">
            {TEXT_BG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`vw-status-compose__color${bgColor === c ? " vw-status-compose__color--active" : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => setBgColor(c)}
                aria-label={`Background ${c}`}
              />
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="vw-status-compose__post"
          disabled={posting}
          onClick={() => void post()}
        >
          {posting ? "Posting…" : "Post status"}
        </button>
      </div>
    </div>
  );
}

export function WebStatusPanel({
  token,
  statuses,
  selfId,
  selfName,
  selfAvatar,
  onSelectUser,
  onRefresh,
  composeOpen: composeOpenProp,
  onComposeOpenChange,
}: {
  token: string;
  statuses: WebStatus[];
  selfId: number;
  selfName: string;
  selfAvatar?: string;
  onSelectUser: (userId: number) => void;
  onRefresh: () => void;
  composeOpen?: boolean;
  onComposeOpenChange?: (open: boolean) => void;
}) {
  const [composeOpenLocal, setComposeOpenLocal] = useState(false);
  const composeOpen = composeOpenProp ?? composeOpenLocal;
  const setComposeOpen = onComposeOpenChange ?? setComposeOpenLocal;
  const myStatuses = statuses.filter((s) => s.user_id === selfId);
  const byUser = (() => {
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
  })();

  return (
    <div className="vw-status-panel">
      <div className="vw-status-panel__header">
        <h1>Status</h1>
        <button
          type="button"
          className="vw-status-panel__add"
          title="Add status"
          onClick={() => setComposeOpen(true)}
        >
          <PenLine size={18} />
        </button>
      </div>
      <div className="vw-status-panel__body">
        <div
          role="button"
          tabIndex={0}
          className="vw-status-panel__row"
          onClick={() => {
            if (myStatuses.length) onSelectUser(selfId);
            else setComposeOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (myStatuses.length) onSelectUser(selfId);
              else setComposeOpen(true);
            }
          }}
        >
          <div className="vw-status-panel__my-avatar">
            <Avatar
              name={selfName}
              url={selfAvatar}
              size={56}
              ring={myStatuses.length > 0 ? "viewed" : null}
            />
            <button
              type="button"
              className="vw-status-panel__add-badge"
              title="Add status"
              onClick={(e) => { e.stopPropagation(); setComposeOpen(true); }}
            >
              +
            </button>
          </div>
          <div>
            <div className="vw-status-panel__name">My status</div>
            <div className="vw-status-panel__hint">
              {myStatuses.length > 0
                ? formatStatusTime(myStatuses[0].created_at)
                : "Tap to add status update"}
            </div>
          </div>
        </div>
        {byUser.length > 0 && (
          <div className="vw-status-panel__section">Recent updates</div>
        )}
        {byUser.map(({ userId, latest, hasUnviewed }) => (
          <div
            key={userId}
            role="button"
            tabIndex={0}
            className="vw-status-panel__row"
            onClick={() => onSelectUser(userId)}
          >
            <Avatar
              name={latest.user_name}
              url={latest.user_avatar}
              size={56}
              ring={hasUnviewed ? "unviewed" : "viewed"}
            />
            <div>
              <div className="vw-status-panel__name">{latest.user_name}</div>
              <div className="vw-status-panel__hint">{formatStatusTime(latest.created_at)}</div>
            </div>
          </div>
        ))}
        {byUser.length === 0 && myStatuses.length === 0 && (
          <div className="vw-status-panel__empty">
            <p>No status updates yet.</p>
            <button type="button" className="vw-status-panel__empty-btn" onClick={() => setComposeOpen(true)}>
              Add your first status
            </button>
          </div>
        )}
      </div>
      <div className="vw-status-panel__footer">
        🔒 Status updates are stored securely and delivered over TLS
      </div>
      {composeOpen ? (
        <StatusComposeModal
          token={token}
          onClose={() => setComposeOpen(false)}
          onPosted={onRefresh}
        />
      ) : null}
    </div>
  );
}
