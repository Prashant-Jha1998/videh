import { WEB_LIST_PANE_WIDTH } from "../../lib/webDesktop";

type Chip = { id: string; label: string; count?: number };

export function WebFilterChips({
  chips,
  activeId,
  onChange,
}: {
  chips: Chip[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "0 12px 8px",
        overflowX: "auto",
        maxWidth: WEB_LIST_PANE_WIDTH,
      }}
    >
      {chips.map((chip) => {
        const active = chip.id === activeId;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChange(chip.id)}
            style={{
              flexShrink: 0,
              padding: "7px 14px",
              borderRadius: 18,
              border: active ? "1px solid #00a884" : "1px solid transparent",
              backgroundColor: active ? "rgba(0,168,132,0.12)" : "#f0f2f5",
              color: active ? "#008069" : "#54656f",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {chip.label}
            {chip.count != null && chip.count > 0 ? ` ${chip.count}` : ""}
          </button>
        );
      })}
    </div>
  );
}
