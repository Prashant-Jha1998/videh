import { useMemo, useRef, useState } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Forward,
  Smile,
  Star,
  Trash2,
} from "lucide-react";
import { webApi, type Message, type Reaction } from "../../lib/webApi";
import { WebChatImage, WebChatVideo } from "./WebChatMedia";
import { WebDocumentBubble } from "./WebDocumentBubble";
import { WebCallMessageBubble } from "./WebCallMessageBubble";
import { WebVoiceMessageBubble } from "./WebVoiceMessageBubble";
import { WebChatForwardModal } from "./WebChatForwardModal";
import { formatMessageBody, isSystemStyleMessage, replyPreviewText } from "../../lib/chatMessageDisplay";
import { isDocumentMessage } from "../../lib/documentMessage";
import { parseCallMessageMeta } from "../../lib/callMessage";
import { highlightMatches } from "../../lib/highlightText";
import { hue } from "./webUiShared";
import { DropdownMenu } from "./WebOverlays";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function groupReactions(reactions: Reaction[] | null | undefined, selfId: number) {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions ?? []) {
    const prev = map.get(r.emoji) ?? { count: 0, mine: false };
    map.set(r.emoji, { count: prev.count + 1, mine: prev.mine || r.user_id === selfId });
  }
  return [...map.entries()];
}

export function WebChatMessage({
  msg,
  token,
  chatId,
  selfId,
  isGroup,
  chatSearchQuery,
  forwardTargets,
  onRefresh,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onEnterSelection,
  onReply,
}: {
  msg: Message;
  token: string;
  chatId: number;
  selfId: number;
  isGroup: boolean;
  chatSearchQuery?: string;
  forwardTargets: Array<{ id: number; name: string }>;
  onRefresh: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onEnterSelection?: (messageId: number) => void;
  onReply?: (msg: Message) => void;
}) {
  const isMe = msg.sender_id === selfId;
  const isDeleted = msg.is_deleted;
  const chatSearchLower = Boolean(chatSearchQuery?.trim());
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAudio = !isDeleted && !!msg.media_url && (
    msg.type === "audio"
    || msg.content.includes("Voice message")
    || msg.content.includes("|w:")
  );
  const isSystem = !isDeleted && isSystemStyleMessage(msg.type, msg.content);
  const callMeta = !isDeleted && !isAudio && !isSystem && (msg.type === "call" || parseCallMessageMeta(msg.content))
    ? parseCallMessageMeta(msg.content)
    : null;
  const hasImage = !isDeleted && msg.type === "image" && !!msg.media_url;
  const hasVideo = !isDeleted && msg.type === "video" && !!msg.media_url;
  const hasDocument = !isDeleted && isDocumentMessage(msg);
  const isVisualMedia = hasImage || hasVideo;
  const bodyText = formatMessageBody(msg);
  const showBodyText = Boolean(bodyText && !callMeta && !isAudio && !hasImage && !hasVideo && !hasDocument);
  const reactionGroups = useMemo(() => groupReactions(msg.reactions, selfId), [msg.reactions, selfId]);
  const showHoverActions = hovered && !selectionMode && !isDeleted;

  const react = async (emoji: string) => {
    if (busy || isDeleted || selectionMode) return;
    setBusy(true);
    try {
      await webApi.reactMessage(token, chatId, msg.id, emoji);
      setReactionOpen(false);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not react.");
    } finally {
      setBusy(false);
    }
  };

  const copyMsg = async () => {
    const text = bodyText || msg.content || "";
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Could not copy message.");
    }
  };

  const deleteMsg = async () => {
    if (!isMe || isDeleted) return;
    if (!confirm("Delete this message for everyone?")) return;
    setBusy(true);
    try {
      await webApi.deleteMessage(token, chatId, msg.id);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete message.");
    } finally {
      setBusy(false);
    }
  };

  const starMsg = async () => {
    if (isDeleted || selectionMode) return;
    setBusy(true);
    try {
      await webApi.starMessage(token, chatId, msg.id);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not star message.");
    } finally {
      setBusy(false);
    }
  };

  const forwardTo = async (targetChatId: number) => {
    if (isDeleted) return;
    setBusy(true);
    try {
      await webApi.forwardMessage(token, chatId, msg.id, targetChatId);
      setForwardOpen(false);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not forward message.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleted) return;
    if (!selectionMode) onEnterSelection?.(msg.id);
    else onToggleSelect?.();
  };

  const handleRowClick = () => {
    if (!selectionMode || isDeleted) return;
    onToggleSelect?.();
  };

  const startReply = () => {
    if (isDeleted || selectionMode) return;
    onReply?.(msg);
    setMenuOpen(false);
    setReactionOpen(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (selectionMode || isDeleted) return;
    e.stopPropagation();
    startReply();
  };

  if (isSystem) {
    return (
      <div className="vw-system-msg">
        <span>{formatMessageBody(msg)}</span>
      </div>
    );
  }

  const bubbleClass = [
    "vw-msg-bubble",
    isMe ? "vw-msg-bubble--sent" : "vw-msg-bubble--recv",
    isVisualMedia || hasDocument ? "vw-msg-bubble--media" : "",
    isAudio ? "vw-msg-bubble--audio" : "",
    isDeleted ? "vw-msg-bubble--deleted" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={`vw-msg-wrap${isMe ? " vw-msg-wrap--sent" : " vw-msg-wrap--recv"}${selectionMode ? " vw-msg-wrap--selecting" : ""}${isSelected ? " vw-msg-wrap--selected" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (!menuOpen) {
          setMenuOpen(false);
          setReactionOpen(false);
        }
      }}
    >
      <div className="vw-msg-select-row">
        {selectionMode && !isDeleted ? (
          <button
            type="button"
            className={`vw-msg-check${isSelected ? " vw-msg-check--on" : ""}`}
            onClick={handleCheckbox}
            aria-label={isSelected ? "Deselect message" : "Select message"}
          >
            {isSelected ? <Check size={14} strokeWidth={3} /> : null}
          </button>
        ) : null}

        <div className={`vw-msg-content${isMe ? " vw-msg-content--sent" : " vw-msg-content--recv"}`}>
          <div className={`vw-msg-hover-zone${isMe ? " vw-msg-hover-zone--sent" : " vw-msg-hover-zone--recv"}`}>
            {showHoverActions ? (
              <div className="vw-msg-side-action" ref={reactionRef}>
                <button
                  type="button"
                  className="vw-msg-emoji-btn"
                  title="React"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReactionOpen((o) => !o);
                    setMenuOpen(false);
                  }}
                >
                  <Smile size={18} strokeWidth={1.75} />
                </button>
                {reactionOpen ? (
                  <div className="vw-msg-reaction-picker">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button key={emoji} type="button" className="vw-msg-reaction-picker__emoji" onClick={() => void react(emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              className={bubbleClass}
              onClick={handleRowClick}
              onDoubleClick={handleDoubleClick}
              role={selectionMode ? "button" : undefined}
            >
              {msg.is_forwarded ? <div className="vw-msg-bubble__forwarded">Forwarded</div> : null}
              {msg.reply_to_id && (msg.reply_content || msg.reply_sender_name) ? (
                <div className={`vw-msg-bubble__quote${isMe ? " vw-msg-bubble__quote--sent" : ""}`}>
                  {msg.reply_sender_name ? (
                    <span className="vw-msg-bubble__quote-name">{msg.reply_sender_name}</span>
                  ) : null}
                  <span className="vw-msg-bubble__quote-text">
                    {msg.reply_content ? replyPreviewText({ type: "text", content: msg.reply_content }) : "Message"}
                  </span>
                </div>
              ) : null}
              {!isMe && isGroup && msg.sender_name ? (
                <div className="vw-msg-bubble__sender" style={{ color: `hsl(${hue(msg.sender_name)},60%,40%)` }}>
                  {chatSearchLower ? highlightMatches(msg.sender_name, chatSearchQuery!) : msg.sender_name}
                </div>
              ) : null}
              {hasImage ? <WebChatImage url={msg.media_url!} token={token} /> : null}
              {hasVideo ? <WebChatVideo url={msg.media_url!} token={token} /> : null}
              {isAudio ? (
                <WebVoiceMessageBubble
                  url={msg.media_url!}
                  token={token}
                  messageId={msg.id}
                  content={msg.content}
                  isMe={isMe}
                />
              ) : null}
              {hasDocument ? (
                <WebDocumentBubble
                  url={msg.media_url!}
                  token={token}
                  content={msg.content || "Document"}
                  highlightQuery={chatSearchLower ? chatSearchQuery : undefined}
                />
              ) : null}
              {callMeta ? <WebCallMessageBubble content={msg.content} isMe={isMe} /> : null}
              {showBodyText ? (
                <p className="vw-msg-bubble__text">
                  {chatSearchLower ? highlightMatches(bodyText!, chatSearchQuery!) : bodyText}
                </p>
              ) : null}
              <div className={`vw-msg-bubble__meta${isVisualMedia && !showBodyText && !callMeta ? " vw-msg-bubble__meta--overlay" : ""}`}>
                <span>{formatTime(msg.created_at)}</span>
                {!showHoverActions && msg.is_starred ? <Star size={11} fill="#f59e0b" color="#f59e0b" /> : null}
                {showHoverActions ? (
                  <button
                    ref={menuBtnRef}
                    type="button"
                    className="vw-msg-bubble__chevron"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen((o) => !o);
                      setReactionOpen(false);
                    }}
                    aria-label="Message options"
                  >
                    <ChevronDown size={15} strokeWidth={2} />
                  </button>
                ) : isMe ? (
                  <svg viewBox="0 0 16 11" width="16" height="11" fill="#53bdeb" aria-hidden><path d="M11.071.653a.45.45 0 0 0-.641 0L4.5 6.582 1.571 3.653a.45.45 0 0 0-.641.642l3.25 3.25a.45.45 0 0 0 .641 0l6.25-6.25a.45.45 0 0 0 0-.642z"/><path d="M15.071.653a.45.45 0 0 0-.641 0L8.5 6.582 7.071 5.153a.45.45 0 0 0-.641.642l1.75 1.75a.45.45 0 0 0 .641 0l6.25-6.25a.45.45 0 0 0 0-.642z"/></svg>
                ) : null}
              </div>
            </div>
          </div>

          {reactionGroups.length > 0 ? (
            <div className={`vw-msg-reactions${isMe ? " vw-msg-reactions--sent" : " vw-msg-reactions--recv"}`}>
              {reactionGroups.map(([emoji, info]) => (
                <button
                  key={emoji}
                  type="button"
                  className={`vw-msg-reactions__chip${info.mine ? " vw-msg-reactions__chip--mine" : ""}`}
                  onClick={() => void react(emoji)}
                >
                  {emoji} {info.count > 1 ? info.count : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!selectionMode ? (
        <DropdownMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={menuBtnRef}
          preferAbove
          items={[
            { label: "Reply", icon: <CornerDownLeft size={18} strokeWidth={1.75} />, onClick: startReply },
            { label: "Copy", icon: <Copy size={18} strokeWidth={1.75} />, onClick: () => void copyMsg() },
            { label: "Forward", icon: <Forward size={18} strokeWidth={1.75} />, onClick: () => setForwardOpen(true) },
            { label: msg.is_starred ? "Unstar" : "Star", icon: <Star size={18} strokeWidth={1.75} />, onClick: () => void starMsg() },
            { divider: true, label: "" },
            { label: "Select", icon: <CheckSquare size={18} strokeWidth={1.75} />, onClick: () => onEnterSelection?.(msg.id) },
            ...(isMe && !isDeleted
              ? [{ label: "Delete", icon: <Trash2 size={18} strokeWidth={1.75} />, danger: true, onClick: () => void deleteMsg() }]
              : []),
          ]}
        />
      ) : null}

      {forwardOpen ? (
        <WebChatForwardModal
          title="Forward message"
          hint="Choose a chat"
          targets={forwardTargets}
          busy={busy}
          onClose={() => setForwardOpen(false)}
          onSelect={(id) => void forwardTo(id)}
        />
      ) : null}
    </div>
  );
}
