/** Web Push (VAPID) subscription for browser / PWA. */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function getWebPushSubscriptionJson(vapidPublicKey: string): Promise<object | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !vapidPublicKey) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.register("/sw.js").catch(() => navigator.serviceWorker.ready);
    const ready = registration instanceof ServiceWorkerRegistration ? registration : await navigator.serviceWorker.ready;

    let subscription = await ready.pushManager.getSubscription();
    if (!subscription) {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }
    return subscription.toJSON();
  } catch {
    return null;
  }
}

export function encodeWebPushToken(subscription: object): string {
  return `webpush:${JSON.stringify(subscription)}`;
}
