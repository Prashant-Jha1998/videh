import { FileText } from "lucide-react";

type Variant = "dark" | "light" | "compact";

export function BillingPolicyNotice({ variant = "light" }: { variant?: Variant }) {
  const dark = variant === "dark";
  const compact = variant === "compact";

  const box = dark
    ? "rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/85"
    : "rounded-xl border border-[#5B4FE8]/25 bg-[#5B4FE8]/5 p-4 text-sm text-[#667781]";

  const title = dark ? "text-white" : "text-[#14131F]";
  const accent = "text-[#5B4FE8]";

  if (compact) {
    return (
      <p className={`text-xs leading-relaxed ${dark ? "text-white/70" : "text-[#667781]"}`}>
        Monthly invoices are due <strong className={title}>15 days after the last day of the billing month</strong>.
        Unpaid invoices past the due date place your API account on hold until payment is received.
      </p>
    );
  }

  return (
    <div className={box}>
      <p className={`font-semibold ${title} flex items-center gap-2 mb-2`}>
        <FileText className={`h-4 w-4 shrink-0 ${accent}`} />
        Invoice &amp; API access policy
      </p>
      <ul className="space-y-2 list-disc list-inside marker:text-[#5B4FE8]">
        <li>
          Each calendar month, Videh issues one consolidated invoice covering your platform plan and API usage for
          that period.
        </li>
        <li>
          The <strong className={title}>due date is 15 days after the last day of the billing month</strong> (e.g. a
          January invoice is due on 15 February).
        </li>
        <li>
          If an invoice remains unpaid after its due date, your API account is automatically placed on{" "}
          <strong className={title}>billing hold</strong> and outbound messaging is suspended.
        </li>
        <li>
          Settling the outstanding invoice restores API access, provided no other overdue unpaid invoices remain on
          the account.
        </li>
        <li>A verified payment method is required before API credentials are issued.</li>
      </ul>
    </div>
  );
}
