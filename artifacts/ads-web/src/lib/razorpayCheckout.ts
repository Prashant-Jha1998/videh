const DEFAULT_LOGO = "https://ads.videh.co.in/videh_icon_foreground.png";

export function getRazorpayLogoUrl(serverUrl?: string | null): string {
  if (serverUrl?.startsWith("http")) return serverUrl;
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.startsWith("https://")) {
      return `${origin.replace(/\/$/, "")}/videh_icon_foreground.png`;
    }
  }
  return DEFAULT_LOGO;
}

export type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function openAdsRazorpayCheckout(opts: {
  keyId: string;
  orderId: string;
  amountInr: number;
  logoUrl?: string;
  companyName: string;
  email: string;
  onSuccess: (response: RazorpayHandlerResponse) => Promise<void>;
  onDismiss: () => void;
}): void {
  if (!window.Razorpay) throw new Error("Payment gateway not loaded. Refresh and try again.");
  const rzp = new window.Razorpay({
    key: opts.keyId,
    amount: Math.round(opts.amountInr * 100),
    currency: "INR",
    name: "Videh Ads",
    image: getRazorpayLogoUrl(opts.logoUrl),
    description: `Add ₹${opts.amountInr.toLocaleString("en-IN")} to ad wallet`,
    order_id: opts.orderId,
    prefill: { name: opts.companyName, email: opts.email },
    theme: { color: "#5B4FE8" },
    method: { card: true, upi: true, netbanking: true, wallet: true },
    handler: (response: RazorpayHandlerResponse) => {
      void opts.onSuccess(response);
    },
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.open();
}
