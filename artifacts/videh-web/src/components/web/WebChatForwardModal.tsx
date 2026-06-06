import { Forward } from "lucide-react";

export function WebChatForwardModal({
  title,
  hint,
  targets,
  busy,
  onClose,
  onSelect,
}: {
  title: string;
  hint?: string;
  targets: Array<{ id: number; name: string }>;
  busy?: boolean;
  onClose: () => void;
  onSelect: (chatId: number) => void;
}) {
  return (
    <div className="vw-forward-overlay" onClick={onClose}>
      <div className="vw-forward-modal" onClick={(e) => e.stopPropagation()}>
        <header className="vw-forward-modal__head">
          <Forward size={18} />
          <h4>{title}</h4>
        </header>
        {hint ? <p className="vw-forward-modal__hint">{hint}</p> : null}
        <ul className="vw-forward-modal__list">
          {targets.length === 0 ? (
            <li className="vw-forward-modal__empty">No other chats available</li>
          ) : (
            targets.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={busy} onClick={() => onSelect(c.id)}>
                  {c.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
