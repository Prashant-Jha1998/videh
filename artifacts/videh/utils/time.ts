export function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const date = new Date(timestamp);
  const today = new Date();

  if (diff < 60 * 1000) return "now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;

  const isToday = date.toDateString() === today.toDateString();
  if (isToday) {
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m} ${ampm}`;
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function formatFullTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

/** Chat bubbles — WhatsApp-style lowercase am/pm */
export function formatChatBubbleTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

/** Short relative label for full-screen media headers (WhatsApp-style). */
export function formatRelativeHeader(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return formatFullTime(timestamp);
}
