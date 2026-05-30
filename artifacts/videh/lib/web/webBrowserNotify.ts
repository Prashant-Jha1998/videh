type WebNotifyOpts = {
  tag?: string;
  icon?: string;
  data?: Record<string, string>;
  onClick?: () => void;
  requireInteraction?: boolean;
};

let permissionRequested = false;

export async function ensureWebNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionRequested) {
    return (Notification.permission as string) === "granted";
  }
  permissionRequested = true;
  try {
    const result = await Notification.requestPermission();
    return (result as string) === "granted";
  } catch {
    return false;
  }
}

export function showWebBrowserNotification(
  title: string,
  body: string,
  opts?: WebNotifyOpts,
): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  if (typeof document !== "undefined" && document.visibilityState === "visible" && !opts?.requireInteraction) {
    return false;
  }
  try {
    const n = new Notification(title, {
      body,
      tag: opts?.tag,
      icon: opts?.icon ?? "/favicon.ico",
      data: opts?.data,
      requireInteraction: opts?.requireInteraction ?? false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
      opts?.onClick?.();
    };
    return true;
  } catch {
    return false;
  }
}

export function closeWebNotificationByTag(tag: string): void {
  /* Browser API has no global close-by-tag; tags replace same notification on next show. */
  void tag;
}
