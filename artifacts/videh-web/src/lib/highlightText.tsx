import type { ReactNode } from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split text and wrap case-insensitive matches in a highlight mark. */
export function highlightMatches(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q || !text) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={`${i}-${part}`} className="vw-search-hit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
