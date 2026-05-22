/** Razorpay Checkout requires a public HTTPS image URL (replaces default "V" placeholder). */
const DEFAULT_LOGO = "https://developer.videh.co.in/videh_icon_foreground.png";

export function getRazorpayLogoUrl(serverUrl?: string | null): string {
  if (serverUrl?.startsWith("http")) return serverUrl;
  const fromEnv = import.meta.env.VITE_RAZORPAY_LOGO_URL as string | undefined;
  if (fromEnv?.startsWith("http")) return fromEnv;
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.startsWith("https://")) {
      return `${origin.replace(/\/$/, "")}/videh_icon_foreground.png`;
    }
  }
  return DEFAULT_LOGO;
}
