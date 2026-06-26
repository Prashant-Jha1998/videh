import type { CallLog } from "@/context/AppContext";

export function filterCallLogs(
  logs: CallLog[],
  opts: { tab?: "all" | "missed"; query?: string },
): CallLog[] {
  let list = opts.tab === "missed" ? logs.filter((c) => c.status === "missed") : logs;
  const q = opts.query?.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
  );
}
