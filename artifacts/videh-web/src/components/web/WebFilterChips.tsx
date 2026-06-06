import "./webShell.css";

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
    <div className="vw-chips">
      {chips.map((chip) => {
        const active = chip.id === activeId;
        return (
          <button
            key={chip.id}
            type="button"
            className={`vw-chip${active ? " vw-chip--active" : ""}`}
            onClick={() => onChange(chip.id)}
          >
            {chip.label}
            {chip.count != null && chip.count > 0 ? ` ${chip.count}` : ""}
          </button>
        );
      })}
    </div>
  );
}
