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
    subtitle: "Fake / shell companies yahi reject ho jaati hain",
    items: [
      {
        icon: Building2,
        title: "Registered entity proof",
        detail: "Pvt Ltd (CIN), LLP (LLPIN), Partnership deed, ya Proprietorship + trade proof.",
      },
      {
        icon: FileCheck2,
        title: "Tax & identity",
        detail: "GST certificate, business PAN, authorized signatory PAN + Aadhaar/passport.",
      },
      {
        icon: Globe,
        title: "Live brand presence",
        detail: "Working website, privacy policy, contact page — brand name match hona chahiye.",
      },
      {
        icon: Scale,
        title: "Use-case screening",
        detail: "Spam, gambling, adult, crypto scams, political bulk — allowed nahi.",
      },
    ],
  },
  {
    phase: "Phase 2",
    title: "Business channel setup",
    subtitle: "API tabhi milti hai jab channel verify ho",
    items: [
      {
        icon: UserCheck,
        title: "Business manager account",
        detail: "Company ka central dashboard — assets, users, billing sab yahi link.",
      },
      {
        icon: ShieldCheck,
        title: "Business verification (KYB)",
        detail: "Documents upload → manual review → 3–10 din. Bina iske production limit nahi.",
      },
      {
        icon: MessageSquareText,
        title: "Display name approval",
        detail: "Customer ko jo brand name dikhega — policy ke hisaab se approve hona zaroori.",
      },
      {
        icon: Phone,
        title: "Dedicated phone number",
        detail: "Personal app wala number use nahi. Naya SIM/landline → OTP verify → channel pe register.",
      },
    ],
  },
  {
    phase: "Phase 3",
    title: "Templates, opt-in & compliance",
    subtitle: "Har automated message pehle approve",
    items: [
      {
        icon: MessageSquareText,
        title: "Template submit & review",
        detail: "Har marketing/utility message ka fixed format — text, header image, buttons. 24–72h review.",
      },
      {
        icon: FileCheck2,
        title: "Opt-in proof (marketing)",
        detail: "Customer ne kab, kahan consent diya — website checkbox, invoice, SMS opt-in log.",
      },
      {
        icon: Scale,
        title: "Policy-aligned content",
        detail: "Misleading offers, fake urgency, banned categories — template reject ya account flag.",
      },
      {
        icon: ShieldCheck,
        title: "Quality rating watch",
        detail: "Block/report zyada → quality drop → limit cut. Green maintain karna mandatory.",
      },
    ],
  },
  {
    phase: "Phase 4",
    title: "Technical go-live",
    subtitle: "Ab developer API access",
    items: [
      {
        icon: KeyRound,
        title: "API credentials",
        detail: "Permanent access token, phone number ID, business account ID — sandbox pehle, production baad.",
      },
      {
        icon: Webhook,
        title: "Webhook endpoint",
        detail: "Inbound replies, delivery status, read receipts — HTTPS URL verify karna padta hai.",
      },
      {
        icon: FileCheck2,
        title: "Billing on file",
        detail: "Per-conversation charges (India): user-initiated ₹0.35–0.58; business marketing/utility/auth/service alag rate. Pehle 100 user-initiated free/month.",
      },
      {
        icon: Globe,
        title: "Integration test",
        detail: "Test numbers par template bhejna → deliver/read confirm → phir scale.",
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
    <section id="requirements" className="py-24 px-4 bg-[#0b141a] text-white relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,168,132,0.15), transparent)",
        }}
      ></div>
      <div className="max-w-6xl mx-auto relative">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-[#00a884] text-sm font-semibold uppercase tracking-widest mb-3">
            API dene se pehle
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Poora verification flow — enterprise grade
          </h2>
          <p className="text-white/65 text-lg leading-relaxed">
            Serious messaging platforms API tabhi dete hain jab company real ho, number verify ho,
            template approve ho, aur billing set ho. Videh bhi wahi rigor follow karta hai.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center"
            >
              <p className="text-2xl md:text-3xl font-extrabold text-[#00a884]">{s.value}</p>
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
                <span className="text-xs font-bold text-[#00a884] uppercase tracking-wider">
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
                    className="flex gap-4 p-5 bg-[#0b141a] hover:bg-[#111b21] transition-colors"
                  >
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-[#00a884]/15 flex items-center justify-center text-[#00a884]">
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

        <div className="mt-12 rounded-2xl border border-[#00a884]/30 bg-[#00a884]/10 p-6 md:p-8 text-center">
          <p className="text-lg font-semibold mb-2">Videh par yahi process — end-to-end</p>
          <p className="text-white/70 text-sm max-w-2xl mx-auto mb-6">
            Aap form bharoge → hum documents verify karenge → business channel + templates approve
            → API keys + webhook. Bich mein koi step skip nahi hota.
          </p>
          <a
            href="#apply"
            className="inline-flex items-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Start verification
          </a>
        </div>
      </div>
    </section>
  );
}

