const CATEGORIES = [
  "All",
  "Music",
  "Mixes",
  "Gaming",
  "News",
  "Sports",
  "Comedy",
  "Education",
  "Tech",
  "Vlogs",
  "Live",
  "Recently uploaded",
];

export function CategoryChips({
  active,
  onChange,
}: {
  active: string;
  onChange: (chip: string) => void;
}) {
  return (
    <div className="yt-chips" role="tablist" aria-label="Categories">
      {CATEGORIES.map((chip) => (
        <button
          key={chip}
          type="button"
          role="tab"
          aria-selected={active === chip}
          className={`yt-chip${active === chip ? " active" : ""}`}
          onClick={() => onChange(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
