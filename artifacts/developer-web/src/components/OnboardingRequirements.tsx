import {
  Building2,
  FileCheck2,
  Globe,
  KeyRound,
  MessageSquareText,
  Phone,
  Scale,
  ShieldCheck,
  UserCheck,
  Webhook,
} from "lucide-react";

const PHASES = [
  {
    phase: "Phase 1",
    title: "Company & legal identity",
    subtitle: "Fake and shell companies are rejected at this stage",
    items: [
      {
        icon: Building2,
        title: "Registered entity proof",
        detail: "Pvt Ltd (CIN), LLP (LLPIN), partnership deed, or proprietorship with trade proof.",
      },
      {
        icon: FileCheck2,
        title: "Tax & identity",
        detail: "GST certificate, business PAN, and authorized signatory PAN + Aadhaar or passport.",
      },
      {
        icon: Globe,
        title: "Live brand presence",
        detail: "Working website, privacy policy, and contact page — brand name must match your application.",
      },
      {
        icon: Scale,
        title: "Use-case screening",
        detail: "Spam, gambling, adult content, crypto scams, and political bulk messaging are not allowed.",
      },
    ],
  },
  {
    phase: "Phase 2",
    title: "Business channel setup",
    subtitle: "API access is granted only after the channel is verified",
    items: [
      {
        icon: UserCheck,
        title: "Business manager account",
        detail: "Your company’s central dashboard — assets, users, and billing are linked here.",
      },
      {
        icon: ShieldCheck,
        title: "Business verification (KYB)",
        detail: "Upload documents → manual review → typically 3–10 days. Production limits apply only after approval.",
      },
      {
        icon: MessageSquareText,
        title: "Display name approval",
        detail: "The brand name customers see must be approved according to policy.",
      },
      {
        icon: Phone,
        title: "Dedicated phone number",
        detail: "Personal numbers are not used. New SIM or landline → OTP verification → register on the channel.",
      },
    ],
  },
  {
    phase: "Phase 3",
    title: "Templates, opt-in & compliance",
    subtitle: "Every automated message is approved before use",
    items: [
      {
        icon: MessageSquareText,
        title: "Template submit & review",
        detail: "Each marketing or utility message uses a fixed format — text, header image, buttons. Review takes 24–72 hours.",
      },
      {
        icon: FileCheck2,
        title: "Opt-in proof (marketing)",
        detail: "When and where the customer gave consent — website checkbox, invoice, or SMS opt-in log.",
      },
      {
        icon: Scale,
        title: "Policy-aligned content",
        detail: "Misleading offers, fake urgency, and banned categories lead to template rejection or account flags.",
      },
      {
        icon: ShieldCheck,
        title: "Quality rating watch",
        detail: "High blocks or reports reduce quality and limits. Maintaining a green rating is mandatory.",
      },
    ],
  },
  {
    phase: "Phase 4",
    title: "Technical go-live",
    subtitle: "Developer API access",
    items: [
      {
        icon: KeyRound,
        title: "API credentials",
        detail: "Permanent access token, phone number ID, and business account ID — sandbox first, then production.",
      },
      {
        icon: Webhook,
        title: "Webhook endpoint",
        detail: "Inbound replies, delivery status, and read receipts — HTTPS URL must be verified.",
      },
      {
        icon: FileCheck2,
        title: "Billing on file",
        detail:
          "Per-conversation charges (India): user-initiated ₹0.35–0.58; business marketing, utility, auth, and service at separate rates. First 100 user-initiated conversations per month are free.",
      },
      {
        icon: Globe,
        title: "Integration test",
        detail: "Send templates to test numbers → confirm delivery and read status → then scale.",
      },
    ],
  },
];

const STATS = [
  { value: "4", label: "Verification phases" },
  { value: "15+", label: "Document & policy checks" },
  { value: "24–72h", label: "Template review SLA" },
  { value: "7d", label: "Typical sandbox access" },
];

export function OnboardingRequirements() {
  return (
    <section id="requirements" className="py-24 px-4 bg-[#12101F] text-white relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,168,132,0.15), transparent)",
        }}
      />
      <div className="max-w-6xl mx-auto relative">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-[#5B4FE8] text-sm font-semibold uppercase tracking-widest mb-3">
            Before API access
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Full verification flow — enterprise grade
          </h2>
          <p className="text-white/65 text-lg leading-relaxed">
            Serious messaging platforms issue API access only when the company is legitimate, the number is
            verified, templates are approved, and billing is configured. Videh follows the same standard.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center"
            >
              <p className="text-2xl md:text-3xl font-extrabold text-[#5B4FE8]">{s.value}</p>
              <p className="text-xs text-white/50 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="space-y-8">
          {PHASES.map((phase, idx) => (
            <div
              key={phase.phase}
              className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                <span className="text-xs font-bold text-[#5B4FE8] uppercase tracking-wider">
                  {phase.phase}
                </span>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{phase.title}</h3>
                  <p className="text-sm text-white/50">{phase.subtitle}</p>
                </div>
                <span className="hidden md:block text-4xl font-black text-white/10">
                  {String(idx + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-px bg-white/10">
                {phase.items.map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-4 p-5 bg-[#12101F] hover:bg-[#14131F] transition-colors"
                  >
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-[#5B4FE8]/15 flex items-center justify-center text-[#5B4FE8]">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1">{item.title}</p>
                      <p className="text-xs text-white/55 leading-relaxed">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-[#5B4FE8]/30 bg-[#5B4FE8]/10 p-6 md:p-8 text-center">
          <p className="text-lg font-semibold mb-2">The same process on Videh — full workflow</p>
          <p className="text-white/70 text-sm max-w-2xl mx-auto mb-6">
            You submit the application → we verify documents → business channel and templates are approved →
            you receive API keys and webhooks. No step can be skipped.
          </p>
          <a
            href="#get-api"
            className="inline-flex items-center gap-2 bg-[#5B4FE8] hover:bg-[#008f6f] text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Start verification
          </a>
        </div>
      </div>
    </section>
  );
}
