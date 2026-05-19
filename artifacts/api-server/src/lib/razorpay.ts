import crypto from "node:crypto";

export function getRazorpayConfig() {
  const keyId = (process.env["RAZORPAY_KEY_ID"] ?? process.env["VITE_RAZORPAY_KEY_ID"] ?? "").trim();
  const keySecret = (process.env["RAZORPAY_KEY_SECRET"] ?? "").trim();
  return { keyId, keySecret, configured: Boolean(keyId && keySecret) };
}

export async function razorpayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret, configured } = getRazorpayConfig();
  if (!configured) throw new Error("Razorpay is not configured.");

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: { description?: string } }).error?.description ?? "Razorpay request failed.");
  }
  return data as T;
}

export async function createRazorpayOrder(args: {
  amountInr: number;
  receipt: string;
  notes: Record<string, string | number | null>;
}) {
  return razorpayRequest<{ id: string; amount: number; currency: string; receipt: string; status: string }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amountInr * 100,
      currency: "INR",
      receipt: args.receipt,
      notes: args.notes,
    }),
  });
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret, configured } = getRazorpayConfig();
  if (!configured) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

type RazorpayPayment = {
  id: string;
  order_id?: string;
  amount: number;
  currency: string;
  method?: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  captured?: boolean;
};

export async function ensureRazorpayPaymentCaptured(args: {
  orderId: string;
  paymentId: string;
  amountInr: number;
}): Promise<RazorpayPayment> {
  const expectedAmount = args.amountInr * 100;
  let payment = await razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(args.paymentId)}`);
  if (payment.order_id !== args.orderId) throw new Error("Payment order mismatch.");
  if (payment.currency !== "INR" || payment.amount !== expectedAmount) throw new Error("Payment amount mismatch.");

  if (payment.status === "captured" || payment.captured) return payment;

  if (payment.status !== "authorized") {
    throw new Error(`Payment is not capturable. Current status: ${payment.status}.`);
  }

  payment = await razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(args.paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: expectedAmount, currency: "INR" }),
  });

  if (payment.status !== "captured" && !payment.captured) {
    throw new Error(`Payment capture failed. Current status: ${payment.status}.`);
  }
  return payment;
}
