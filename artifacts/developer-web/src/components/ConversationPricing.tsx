import { MessageCircle, Shield, Zap } from "lucide-react";

const BUSINESS_CATEGORIES = [
  { key: "marketing", label: "Marketing", rate: "₹0.78", note: "Promotions & offers (highest)" },
  { key: "utility", label: "Utility", rate: "₹0.35", note: "Order updates, alerts" },
  { key: "authentication", label: "Authentication", rate: "₹0.35", note: "OTP & verification" },
  { key: "service", label: "Service", rate: "₹0.35", note: "Replies within 24h window (lowest)" },
] as const;

type Variant = "dark" | "light";

export function ConversationPricing({ variant = "dark" }: { variant?: Variant }) {
  const dark = variant === "dark";
  const card = dark
    ? "rounded-2xl border border-white/10 bg-white/5 p-5"
    : "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
  const title = dark ? "text-white" : "text-[#14131F]";
  const muted = dark ? "text-white/60" : "text-[#667781]";
  const accent = "text-[#5B4FE8]";

  return (
    <div className="space-y-6">
      <div className="text-center max-w-2xl mx-auto">
        <p className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${accent} mb-3`}>
          <Zap className="h-3.5 w-3.5" />
          Conversation-based pricing · India
        </p>
        <h3 className={`text-2xl md:text-3xl font-bold ${title}`}>Pay per conversation, not per SMS</h3>
        <p className={`mt-2 text-sm ${muted}`}>
          Same industry model: user-initiated vs business-initiated. Payment method must be verified before API
          access — usage auto-debited monthly; API holds if payment fails.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className={`h-5 w-5 ${accent}`} />
            <h4 className={`font-bold ${title}`}>User-initiated</h4>
          </div>
          <p className={`text-2xl font-extrabold ${title}`}>
            ₹0.35 – ₹0.58 <span className={`text-sm font-normal ${muted}`}>/ conversation</span>
          </p>
          <p className={`text-sm mt-2 ${muted}`}>Customer messages your business first.</p>
          <p className={`text-xs mt-3 ${accent} font-medium`}>
            Free tier: first 100 user-initiated conversations / month
          </p>
        </div>

        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className={`h-5 w-5 ${accent}`} />
            <h4 className={`font-bold ${title}`}>Business-initiated</h4>
          </div>
          <p className={`text-sm ${muted} mb-3`}>You message the customer first — rate by category:</p>
          <ul className="space-y-2">
            {BUSINESS_CATEGORIES.map((c) => (
              <li key={c.key} className="flex justify-between gap-2 text-sm">
                <span className={title}>
                  <strong>{c.label}</strong>
                  <span className={`block text-xs ${muted}`}>{c.note}</span>
                </span>
                <span className={`font-semibold shrink-0 ${accent}`}>{c.rate}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className={
          dark
            ? "rounded-xl border border-[#5B4FE8]/30 bg-[#5B4FE8]/10 p-4 text-sm text-white/80"
            : "rounded-xl border border-[#5B4FE8]/30 bg-[#5B4FE8]/5 p-4 text-sm text-[#667781]"
        }
      >
        <p className={`font-semibold ${title} flex items-center gap-2 mb-2`}>
          <Shield className={`h-4 w-4 ${accent}`} />
          Payment flow (before API)
        </p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Add & verify payment method (₹5 Razorpay check — card/UPI)</li>
          <li>Admin approves documents, profile & templates</li>
          <li>API keys issued — usage billed per conversation to your company</li>
          <li>If monthly usage payment fails → API automatically on hold</li>
        </ol>
        <p className={`mt-3 text-xs ${muted}`}>
          24-hour rule: replies inside 24h after customer message = Service category (often free within window).
        </p>
      </div>
    </div>
  );
}