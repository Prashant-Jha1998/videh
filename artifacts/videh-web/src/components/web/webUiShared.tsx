import type { ChatMember } from "../../lib/webApi";

export const WA_GREEN = "#5B4FE8";
export const WA_BG = "#f0f2f5";
export const WA_TEXT = "#14131F";
export const WA_MUTED = "#667781";

export function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function hue(name: string) {
  return name.charCodeAt(0) * 37 % 360;
}

export function groupContactsByLetter(users: ChatMember[]) {
  const sorted = [...users].sort((a, b) => (a.name ?? a.phone ?? "").localeCompare(b.name ?? b.phone ?? ""));
  const groups: { letter: string; users: ChatMember[] }[] = [];
  let current = "";
  for (const u of sorted) {
    const label = (u.name ?? u.phone ?? "?").trim();
    const letter = /^[A-Za-z]/.test(label) ? label[0].toUpperCase() : "#";
    if (letter !== current) {
      current = letter;
      groups.push({ letter, users: [] });
    }
    groups[groups.length - 1].users.push(u);
  }
  return groups;
}

export function Avatar({
  name,
  url,
  size = 49,
  ring,
}: {
  name: string;
  url?: string;
  size?: number;
  ring?: "unviewed" | "viewed" | null;
}) {
  const core = url ? (
    <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: `hsl(${hue(name)},50%,45%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: 700,
        fontSize: Math.max(12, size * 0.36),
      }}
    >
      {initials(name)}
    </div>
  );

  if (!ring) return <div style={{ flexShrink: 0 }}>{core}</div>;

  return (
    <div style={{ position: "relative", width: size + 4, height: size + 4, flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2.5px solid ${ring === "unviewed" ? "var(--vw-primary, #5B4FE8)" : "#8696a0"}`,
        }}
      />
      <div style={{ position: "absolute", top: 2, left: 2 }}>{core}</div>
    </div>
  );
}
