import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Code2,
  Globe,
  MessageSquare,
  Shield,
  Webhook,
  Zap,
} from "lucide-react";
import { TemplateMessagePreview } from "./components/TemplateMessagePreview";
import { OnboardingRequirements } from "./components/OnboardingRequirements";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { ConversationPricing } from "./components/ConversationPricing";
import { DeveloperDashboard } from "./components/DeveloperDashboard";
import { DeveloperAuth, type AuthMode } from "./components/DeveloperAuth";
import { devFetch } from "./lib/devFetch";
import { isLeadConsoleReady, type ActiveLeadSummary } from "./lib/developerPortalState";

const NAV = [
  { href: "#requirements", label: "Verification" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#api", label: "API" },
  { href: "#dashboard", label: "Developer console" },
  { href: "#get-api", label: "Apply", action: "apply" as const },
];

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Template messages",
    desc: "Image, video, document headers with body variables and CTA buttons — enterprise-grade marketing templates.",
  },
  {
    icon: BadgeCheck,
    title: "Verified Business profile",
    desc: "Blue tick eligibility guidance, display name approval, and Videh business verification support.",
  },
  {
    icon: Webhook,
    title: "Webhooks & inbox",
    desc: "Inbound messages, delivery receipts, read status, and agent handoff to your CRM or support desk.",
  },
  {
    icon: Code2,
    title: "REST API & SDKs",
    desc: "Send messages from Node, Python, PHP, or Zapier. Sandbox keys before you go live.",
  },
  {
    icon: BarChart3,
    title: "Analytics & quality",
    desc: "Template performance, quality rating monitoring, and opt-in compliance dashboards.",
  },
  {
    icon: Shield,
    title: "Compliance-first onboarding",
    desc: "GST, COI, and director KYC. We reject fake companies — protecting your brand and ours.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Apply with company documents",
    desc: "Pvt Ltd, LLP, or Proprietorship with GSTIN, PAN, website, and authorized signatory details.",
  },
  {
    n: "02",
    title: "Videh Business Console setup",
    desc: "We create or link your Videh business account, verified business channel, and phone number.",
  },
  {
    n: "03",
    title: "Template creation & approval",
    desc: "Draft marketing or utility templates in Hindi/English. Videh reviews — typically 24–72 hours.",
  },
  {
    n: "04",
    title: "API keys & go live",
    desc: "Production access token, webhook URL, and per-message billing. Start sending at scale.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "₹2,999",
    period: "/month + Videh usage charges",
    highlights: ["1 channel · 1 phone number", "5,000 messages/mo included", "Email support", "Sandbox + docs"],
  },
  {
    name: "Growth",
    price: "₹9,999",
    period: "/month + Videh usage charges",
    popular: true,
    highlights: [
      "3 channels · 5 numbers",
      "50,000 messages/mo included",
      "Template review assistance",
      "Webhook + CRM integration help",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "volume pricing",
    highlights: [
      "Unlimited scale",
      "Dedicated account manager",
      "SLA & priority Videh escalations",
      "Multi-brand & reseller options",
    ],
  },
];

const FAQ = [
  {
    q: "Which companies can apply?",
    a: "Registered Pvt Ltd, LLP, partnership firms, or legitimate proprietorships with GST and a verifiable website. Fake shell companies are rejected.",
  },
  {
    q: "What is a template message?",
    a: "A pre-approved message format on Videh — image or video header, formatted body with variables such as the customer name, and buttons (URL, quick reply, call). Users must opt in for marketing.",
  },
  {
    q: "How long until we go live?",
    a: "Document verification: 1–2 days. Videh business verification: 3–10 days. Template approval: 1–3 days per template. Sandbox access is often available within the same week.",
  },
  {
    q: "Can I use the API directly on my own?",
    a: "Yes, but you must set up your own technical team, compliance, and billing. Videh partner onboarding includes Indian support and faster troubleshooting.",
  },
  {
    q: "What is the per-conversation cost?",
    a: "User-initiated: ~₹0.35–0.58. Business-initiated marketing: ~₹0.78; utility, authentication, and service: ~₹0.35. The first 100 user-initiated conversations per month are free. Payment method verification is required before API access.",
  },
];

const API_ME = `curl https://developer.videh.co.in/v1/me \\
  -H "Authorization: Bearer vsec_YOUR_SECRET"`;

const API_LIST_TEMPLATES = `curl https://developer.videh.co.in/v1/templates \\
  -H "Authorization: Bearer vsec_YOUR_SECRET"`;

const API_SAMPLE = `curl -X POST https://developer.videh.co.in/v1/PHONE_NUMBER_ID/messages \\
  -H "Authorization: Bearer vsec_YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "919876543210",
    "template": {
      "name": "order_update",
      "language": { "code": "en" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "Prashant" },
            { "type": "text", "text": "ORD-88421" }
          ]
        }
      ]
    }
  }'`;

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left font-semibold text-[#14131F] hover:text-[#5B4FE8] transition-colors"
      >
        {q}
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="pb-4 text-[#667781] text-sm leading-relaxed">{a}</p>}
    </div>
  );
}

function authModeFromHash(): AuthMode | null {
  const h = window.location.hash.replace("#", "");
  if (h === "login" || h === "signup") return h;
  if (h === "forgot-password") return "forgot";
  if (h === "reset-password") return "reset";
  return null;
}

function setAuthHash(mode: AuthMode) {
  const map: Record<AuthMode, string> = {
    login: "#login",
    signup: "#signup",
    forgot: "#forgot-password",
    reset: "#reset-password",
  };
  window.location.hash = map[mode];
}

export default function App() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [session, setSession] = useState<{ email: string } | null>(null);
  const [activeLead, setActiveLead] = useState<ActiveLeadSummary | null>(null);

  const consoleReady = isLeadConsoleReady(activeLead);

  const refreshSession = useCallback(async () => {
    try {
      const r = await devFetch("/api/developer-auth/me");
      const d = (await r.json()) as {
        success?: boolean;
        user?: { email: string };
        activeLead?: ActiveLeadSummary & { id: number; reference_code: string };
      };
      if (r.ok && d.success && d.user) {
        const email = d.user.email;
        setSession((prev) => (prev?.email === email ? prev : { email }));
        setActiveLead((prev) => {
          const next = d.activeLead ?? null;
          if (!next && !prev) return null;
          if (
            next &&
            prev &&
            next.id === prev.id &&
            next.reference_code === prev.reference_code &&
            next.status === prev.status &&
            next.wizard_step === prev.wizard_step
          ) {
            return prev;
          }
          return next;
        });
      } else {
        setSession(null);
        setActiveLead(null);
      }
    } catch {
      setSession(null);
      setActiveLead(null);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash;
      if (hash === "#dashboard" && consoleReady) {
        window.location.hash = "#apply";
        return;
      }
      setWizardOpen(hash === "#apply");
      setAuthMode(authModeFromHash());
      if (hash === "#apply" && !session) {
        sessionStorage.setItem("videh_auth_next", "apply");
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [consoleReady, session]);

  const openConsole = (e?: MouseEvent) => {
    e?.preventDefault();
    if (!session) {
      sessionStorage.setItem("videh_auth_next", "apply");
      window.location.hash = "#signup";
      return;
    }
    window.location.hash = "#apply";
  };

  const openApplyWizard = openConsole;

  const closeWizard = () => {
    if (window.location.hash === "#apply") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setWizardOpen(false);
  };

  const onAuthSuccess = () => {
    void refreshSession();
    const next = sessionStorage.getItem("videh_auth_next");
    sessionStorage.removeItem("videh_auth_next");
    if (next === "apply") {
      window.location.hash = "#apply";
    } else {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setAuthMode(null);
    }
  };

  const logout = async () => {
    await devFetch("/api/developer-auth/logout", { method: "POST" });
    setSession(null);
    setActiveLead(null);
    history.replaceState(null, "", window.location.pathname);
  };

  const needAuthForWizard = useCallback(() => {
    window.location.hash = "#signup";
  }, []);

  return (
    <div className="min-h-screen">
      {authMode ? (
        <DeveloperAuth
          mode={authMode}
          onClose={() => {
            history.replaceState(null, "", window.location.pathname + window.location.search);
            setAuthMode(null);
          }}
          onSuccess={onAuthSuccess}
          onSwitchMode={(mode) => {
            setAuthHash(mode);
            setAuthMode(mode);
          }}
        />
      ) : null}
      {wizardOpen ? <OnboardingWizard onClose={closeWizard} onNeedAuth={needAuthForWizard} /> : null}
      {!wizardOpen && !authMode ? (
      <>
      <header className="fixed top-0 inset-x-0 z-50 glass border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-[4.5rem] md:h-20 flex items-center justify-between gap-3">
          <a href="#" className="flex items-center gap-3 text-white font-bold shrink-0 min-w-0">
            <span className="flex h-12 w-12 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1.5 md:p-2 shadow-lg ring-2 ring-white/30">
              <img
                src="/videh_icon_foreground.png"
                alt="Videh"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="hidden sm:inline leading-tight">
              Videh <span className="text-[#5B4FE8] font-semibold text-base sm:ml-1">Developer</span>
            </span>
          </a>
          <nav className="hidden lg:flex items-center justify-center gap-2 flex-1 px-2">
            {NAV.filter((l) => !(consoleReady && l.href === "#get-api")).map((l) => {
              const href = consoleReady && l.href === "#dashboard" ? "#apply" : l.href;
              const open =
                (consoleReady && l.href === "#dashboard") || ("action" in l && l.action === "apply");
              return (
                <a
                  key={l.href}
                  href={href}
                  onClick={open ? openConsole : undefined}
                  className="text-sm font-semibold text-white/95 px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 hover:border-white/30 transition-colors whitespace-nowrap"
                >
                  {l.label}
                </a>
              );
            })}
          </nav>
          <div className="shrink-0 flex items-center gap-2">
            {session ? (
              <>
                <span className="hidden md:inline text-xs text-white/70 truncate max-w-[140px]">{session.email}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-sm font-semibold text-white/90 px-3 py-2 rounded-lg border border-white/20 hover:bg-white/10"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a
                  href="#login"
                  className="text-sm font-semibold text-white/90 px-3 py-2 rounded-lg border border-white/20 hover:bg-white/10"
                >
                  Sign in
                </a>
                <a
                  href="#signup"
                  className="text-sm font-semibold text-[#5B4FE8] px-3 py-2 rounded-lg bg-white hover:bg-white/90"
                >
                  Sign up
                </a>
              </>
            )}
            <a
              href={consoleReady ? "#apply" : "#get-api"}
              onClick={openConsole}
              className="text-sm font-semibold bg-[#5B4FE8] hover:bg-[#008f6f] text-white px-4 py-2.5 rounded-lg transition-colors shadow-md shadow-[#5B4FE8]/25 whitespace-nowrap"
            >
              {consoleReady ? "Open console" : "Get API access"}
            </a>
          </div>
        </div>
      </header>

      <section className="gradient-hero pt-28 md:pt-32 pb-16 md:pb-20 px-4 text-white overflow-x-hidden">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_minmax(300px,400px)] gap-10 lg:gap-14 items-start">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#5B4FE8] bg-[#5B4FE8]/15 rounded-full px-3 py-1 mb-5">
              <Zap className="h-3.5 w-3.5" />
              Videh Business Messaging API · India
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-extrabold leading-[1.1] tracking-tight mb-5">
              Official business messaging API for{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00c9a0] to-[#5B4FE8]">
                your company logo
              </span>
            </h1>
            <p className="text-lg text-white/75 leading-relaxed mb-8 max-w-xl">
              Pvt Ltd, LLP, Proprietorship — send automated template messages with images, buttons, and
              verified business branding. Videh is your technology partner from onboarding to production API.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#apply"
                onClick={openApplyWizard}
                className="inline-flex items-center gap-2 bg-[#5B4FE8] hover:bg-[#008f6f] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                Start application
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#api"
                className="inline-flex items-center gap-2 border border-white/25 hover:bg-white/10 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                <Code2 className="h-4 w-4" />
                View API docs
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-white/60">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#5B4FE8]" /> Videh Cloud API
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#5B4FE8]" /> Template + Utility
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#5B4FE8]" /> Indian support
              </span>
            </div>
          </motion.div>

          <motion.div
            className="w-full flex justify-center lg:justify-end lg:sticky lg:top-28"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.1 }}
          >
            <div className="w-full max-w-[380px]">
              <TemplateMessagePreview />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-4 bg-[#14131F] border-y border-white/5">
        <div className="max-w-6xl mx-auto px-4 flex flex-wrap justify-center gap-x-10 gap-y-2 text-center text-sm text-white/50">
          <span>Trusted by Indian businesses for</span>
          <span className="text-white/80">Order alerts</span>
          <span className="text-white/80">OTP & auth</span>
          <span className="text-white/80">Marketing campaigns</span>
          <span className="text-white/80">Support inbox</span>
        </div>
      </section>

      <OnboardingRequirements />

      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-[#14131F] mb-3 text-center">
            Enterprise-grade business messaging — managed for you
          </h2>
          <p className="text-[#667781] text-center max-w-2xl mx-auto mb-12">
            Leading Indian brands send template messages with images, buttons, and verified profiles.
            Videh gives your company the same capabilities with compliant onboarding.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl bg-white p-6 border border-gray-100 shadow-sm hover:shadow-md hover:border-[#5B4FE8]/30 transition-all"
              >
                <div className="h-11 w-11 rounded-xl bg-[#5B4FE8]/10 flex items-center justify-center text-[#5B4FE8] mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-[#14131F] mb-2">{f.title}</h3>
                <p className="text-sm text-[#667781] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10 text-[#14131F]">
            Supported business entities
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Building2, label: "Private Limited", sub: "Pvt Ltd · CIN required" },
              { icon: Building2, label: "LLP", sub: "LLPIN · Partnership deed" },
              { icon: Globe, label: "Proprietorship", sub: "GST + trade license" },
              { icon: Building2, label: "Partnership", sub: "Registered firm docs" },
            ].map((e) => (
              <div
                key={e.label}
                className="rounded-xl border border-gray-200 p-5 text-center hover:border-[#5B4FE8]/40 transition-colors"
              >
                <e.icon className="h-8 w-8 text-[#5B4FE8] mx-auto mb-3" />
                <p className="font-semibold text-[#14131F]">{e.label}</p>
                <p className="text-xs text-[#667781] mt-1">{e.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-20 px-4 bg-[#f0f2f5]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-[#14131F] mb-3 text-center">How onboarding works</h2>
          <p className="text-[#667781] text-center mb-12 max-w-xl mx-auto">
            Videh requires real businesses — not fake shells. We verify you first, then guide business
            verification and template approval.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <span className="text-4xl font-black text-[#5B4FE8]/20">{s.n}</span>
                <h3 className="font-bold text-[#14131F] mt-2 mb-2">{s.title}</h3>
                <p className="text-sm text-[#667781] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="api" className="py-20 px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-3xl font-bold text-[#14131F] mb-4">Developer-first REST API</h2>
            <p className="text-[#667781] mb-6 leading-relaxed">
              Integrate in minutes. Send utility OTPs, order updates, or marketing templates from your backend,
              ERP, or no-code automation.
            </p>
            <ul className="space-y-3 text-sm">
              {[
                "Bearer token authentication",
                "Webhook signatures (HMAC)",
                "Template component builder",
                "Media upload API",
                "Rate limits with burst allowance",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-[#14131F]">
                  <CheckCircle2 className="h-4 w-4 text-[#5B4FE8] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <p className="text-xs font-semibold text-[#667781] uppercase tracking-wide">Account &amp; channel IDs</p>
            <pre className="code-block rounded-2xl bg-[#12101F] text-[#e9edef] p-5 overflow-x-auto border border-white/10 shadow-xl text-xs">
              <code>{API_ME}</code>
            </pre>
            <p className="text-xs font-semibold text-[#667781] uppercase tracking-wide">List approved templates</p>
            <pre className="code-block rounded-2xl bg-[#12101F] text-[#e9edef] p-5 overflow-x-auto border border-white/10 shadow-xl text-xs">
              <code>{API_LIST_TEMPLATES}</code>
            </pre>
            <p className="text-xs font-semibold text-[#667781] uppercase tracking-wide">Send message (Videh API path)</p>
            <pre className="code-block rounded-2xl bg-[#12101F] text-[#e9edef] p-5 overflow-x-auto border border-white/10 shadow-xl text-xs">
              <code>{API_SAMPLE}</code>
            </pre>
          </div>
        </div>
      </section>

      {!consoleReady ? <DeveloperDashboard /> : null}

      <section id="pricing" className="py-20 px-4 bg-[#14131F] text-white">
        <div className="max-w-6xl mx-auto">
          <ConversationPricing variant="dark" />
          <h3 className="text-xl font-bold text-center mt-16 mb-3">Platform plans (partner fee)</h3>
          <p className="text-white/60 text-center mb-8 max-w-lg mx-auto text-sm">
            Monthly platform fee plus conversation usage. Payment method verification required before API.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-6 border ${
                  p.popular
                    ? "border-[#5B4FE8] bg-[#5B4FE8]/10 scale-[1.02] shadow-xl shadow-[#5B4FE8]/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {p.popular && (
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5B4FE8] mb-2 block">
                    Most popular
                  </span>
                )}
                <h3 className="text-xl font-bold">{p.name}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-extrabold">{p.price}</span>
                  <span className="text-sm text-white/50 block mt-1">{p.period}</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-white/75">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#5B4FE8] shrink-0 mt-0.5" />
                      {h}
                    </li>
                  ))}
                </ul>
                <a
                  href="#apply"
                  onClick={openApplyWizard}
                  className={`mt-8 block text-center font-semibold py-2.5 rounded-xl transition-colors ${
                    p.popular
                      ? "bg-[#5B4FE8] hover:bg-[#008f6f] text-white"
                      : "border border-white/20 hover:bg-white/10"
                  }`}
                >
                  Choose {p.name}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto rounded-2xl bg-amber-50 border border-amber-200/80 p-6 md:p-8">
          <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-3">
            <Shield className="h-5 w-5" />
            We do not onboard fake companies
          </h3>
          <p className="text-sm text-amber-900/80 leading-relaxed">
            Videh blocks partners that enable spam. We verify GST, company registration, website, and use case
            before submission. Shell companies, gambling, adult content, and unsolicited bulk marketing are
            rejected. This protects your number quality rating and keeps the platform sustainable.
          </p>
        </div>
      </section>

      <section id="apply" className="py-20 px-4 bg-gradient-to-b from-[#f0f2f5] to-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <h2 className="text-3xl font-bold text-[#14131F] mb-4">Get API access</h2>
            <p className="text-[#667781] leading-relaxed mb-6">
              Opens the Videh Business API console — step-by-step modules for plan, company details, compliance
              documents, business profile, and payment verification (same layout as enterprise messaging portals).
            </p>
            <div className="space-y-4 text-sm">
              <p className="font-semibold text-[#14131F]">Documents typically required:</p>
              <ul className="space-y-2 text-[#667781]">
                <li>• Certificate of Incorporation / LLP agreement</li>
                <li>• GST certificate</li>
                <li>• PAN of business & authorized signatory</li>
                <li>• Brand website with privacy policy</li>
                <li>• Sample templates & opt-in proof (for marketing)</li>
              </ul>
            </div>
          </div>
          <a
            href="#apply"
            onClick={openApplyWizard}
            className="inline-flex items-center justify-center gap-2 w-full bg-[#5B4FE8] hover:bg-[#008f6f] text-white font-semibold px-6 py-4 rounded-xl"
          >
            Open step-by-step application
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </section>

      <section className="py-16 px-4 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8 text-[#14131F]">Frequently asked questions</h2>
        <div className="bg-white rounded-2xl border border-gray-200 px-6 shadow-sm">
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      <footer className="bg-[#12101F] text-white/60 py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div>
            <p className="font-bold text-white mb-2">Videh Developer Platform</p>
            <p className="text-sm max-w-xs">
              Business messaging API solutions for Indian enterprises. A product of Videh.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <a href="https://videh.co.in" className="hover:text-white">
              videh.co.in
            </a>
            <a href="https://web.videh.co.in" className="hover:text-white">
              Videh Web
            </a>
            <a href="mailto:developer@videh.co.in" className="hover:text-white">
              developer@videh.co.in
            </a>
          </div>
        </div>
        <p className="max-w-6xl mx-auto mt-8 pt-8 border-t border-white/10 text-xs text-center">
          © {new Date().getFullYear()} Videh. Business messaging API by Videh — built in India.
        </p>
      </footer>
      </>
      ) : null}
    </div>
  );
}
