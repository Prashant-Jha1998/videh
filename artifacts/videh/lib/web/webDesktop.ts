export type WebDesktopSection =
  | "chats"
  | "calls"
  | "status"
  | "settings"
  | "starred"
  | "archived";

export const WEB_DESKTOP_MIN_WIDTH = 900;
export const WEB_LIST_PANE_WIDTH = 400;
export const WEB_CONTACT_PANEL_WIDTH = 360;
export const WEB_NAV_RAIL_WIDTH = 68;

export function getWebSection(pathname: string | null | undefined): WebDesktopSection {
  const p = pathname ?? "";
  if (p.includes("/starred")) return "starred";
  if (p.includes("/archived") || p.includes("archived=1")) return "archived";
  if (p.includes("/calls")) return "calls";
  if (p.includes("/status")) return "status";
  if (p.includes("/settings")) return "settings";
  return "chats";
}

export function activeChatIdFromPath(pathname: string | null | undefined): string | undefined {
  const m = (pathname ?? "").match(/\/chat\/([^/?]+)/);
  return m?.[1];
}
