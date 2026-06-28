import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import {
  API_LANG_LABELS,
  API_LANG_ORDER,
  envSnippet,
  meSnippet,
  sendMessageSnippet,
  templatesSnippet,
  type ApiLang,
  type SnippetCtx,
} from "../lib/apiUsageSnippets";

type Props = {
  variant?: "public" | "console";
  snippetCtx?: SnippetCtx;
};

const LANGS: ApiLang[] = API_LANG_ORDER;

const QUICK_STEPS = [
  {
    n: "1",
    title: "Complete onboarding",
    desc: "Verify business channel, payment method, and get templates approved in this console.",
  },
  {
    n: "2",
    title: "Copy credentials",
    desc: "From API access: Key ID (vsk_…), Secret (vsec_…), and Phone Number ID. Store in server .env only.",
  },
  {
    n: "3",
    title: "List templates",
    desc: "GET /v1/templates — use only approved template names and matching language codes.",
  },
  {
    n: "4",
    title: "Send from your backend",
    desc: "POST /v1/{phone-number-id}/messages from your backend (Java, Kotlin, Node, Python, etc.) — never from browser JS.",
  },
  {
    n: "5",
    title: "Recipient on Videh",
    desc: "The mobile number must be registered on the Videh app. Messages appear in their Videh inbox.",
  },
  {
    n: "6",
    title: "Handle errors",
    desc: "Check error.code in JSON responses (template_not_approved, recipient_not_on_videh, etc.).",
  },
];

const ENDPOINTS = [
  { method: "GET", path: "/v1/me", desc: "Account, channel IDs, billing status" },
  { method: "GET", path: "/v1/templates", desc: "List approved templates" },
  { method: "GET", path: "/v1/templates/{name}", desc: "Single template details" },
  { method: "POST", path: "/v1/{phone-number-id}/messages", desc: "Send template message (recommended)" },
  { method: "POST", path: "/v1/business-messages", desc: "Send without phone ID in URL" },
  { method: "GET", path: "/v1/settings/webhook", desc: "Current webhook URL" },
  { method: "POST", path: "/v1/settings/webhook", desc: "Set HTTPS webhook URL" },
];

const ERRORS = [
  { code: "unauthorized", http: "401", fix: "Check Bearer token: vsk_KEY:vsec_SECRET or vsec_SECRET only" },
  { code: "phone_number_id_mismatch", http: "403", fix: "Use YOUR Phone Number ID in URL — not /v1/whatsapp/messages" },
  { code: "channel_not_verified", http: "403", fix: "Complete phone OTP under Business channel" },
  { code: "template_not_approved", http: "400", fix: "Submit template and wait for Videh approval" },
  { code: "language_mismatch", http: "400", fix: "Use exact language from template (e.g. en)" },
  { code: "recipient_not_on_videh", http: "404", fix: "User must install Videh and sign up with same mobile" },
  { code: "cannot_message_self", http: "400", fix: "Cannot send to your own business channel phone" },
  { code: "billing_on_hold", http: "402", fix: "Pay any invoice past its due date (due date = last day of billing month + 15 days), or verify your payment method" },
];

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative group">
      {label ? (
        <p className="text-xs font-semibold text-[#667781] uppercase tracking-wide mb-2">{label}</p>
      ) : null}
      <pre className="code-block rounded-2xl bg-[#12101F] text-[#e9edef] p-5 overflow-x-auto border border-white/10 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy code"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function LangTabs({
  lang,
  onLang,
  code,
  label,
}: {
  lang: ApiLang;
  onLang: (l: ApiLang) => void;
  code: string;
  label?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onLang(l)}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              lang === l
                ? "bg-[#5B4FE8] text-white border-[#5B4FE8]"
                : "bg-white text-[#667781] border-gray-200 hover:border-[#5B4FE8]/40"
            }`}
          >
            {API_LANG_LABELS[l]}
          </button>
        ))}
      </div>
      <CodeBlock code={code} label={label} />
    </div>
  );
}

export function DeveloperUsageGuide({ variant = "public", snippetCtx = {} }: Props) {
  const [lang, setLang] = useState<ApiLang>("curl");
  const isConsole = variant === "console";
  const ctx = snippetCtx;

  return (
    <div className={isConsole ? "space-y-8 w-full min-w-0 overflow-x-clip" : "max-w-6xl mx-auto space-y-12 w-full min-w-0 px-4 sm:px-0 overflow-x-clip"}>
      {!isConsole ? (
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-[#5B4FE8] uppercase tracking-wider mb-2">Integration guide</p>
          <h2 className="text-3xl font-bold text-[#14131F] mb-3">How to use the Videh API in your project</h2>
          <p className="text-[#667781] leading-relaxed">
            Step-by-step guide with copy-paste code for <strong>12 languages</strong>: cURL, Node.js, Python,{" "}
            <strong>Java</strong>, <strong>Kotlin</strong>, Go, C# (.NET), PHP, Ruby, Swift, Dart, and Deno.
            Any stack that can send HTTPS JSON requests works — no official SDK required.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-[#5B4FE8] uppercase tracking-wide">Usage guide</p>
          <h2 className="text-2xl font-bold text-[#14131F] mt-1">Integrate API in your website or app</h2>
          <p className="text-sm text-[#667781] mt-2">
            Copy examples below into your backend. Credentials from <strong>API access</strong> are pre-filled when
            available.
          </p>
        </div>
      )}

      {/* Quick steps */}
      <section className={isConsole ? "" : "rounded-2xl bg-white border border-gray-100 p-6 md:p-8 shadow-sm"}>
        <h3 className="font-bold text-[#14131F] text-lg mb-4">Quick start (6 steps)</h3>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_STEPS.map((s) => (
            <li key={s.n} className="rounded-xl bg-[#f0f2f5] p-4">
              <span className="text-xs font-bold text-[#5B4FE8]">Step {s.n}</span>
              <p className="font-semibold text-[#14131F] mt-1 text-sm">{s.title}</p>
              <p className="text-xs text-[#667781] mt-1 leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Important notice */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200/80 p-5 md:p-6 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900/90 space-y-2">
          <p className="font-bold text-amber-900">Important — read before coding</p>
          <ul className="space-y-1.5 list-disc pl-4">
            <li>
              <strong>Server-side only:</strong> Never put <code className="text-xs bg-white/60 px-1 rounded">vsec_</code>{" "}
              secrets in React, Android, or browser JavaScript. Use a backend or Supabase Edge Function.
            </li>
            <li>
              <strong>Correct send URL:</strong>{" "}
              <code className="text-xs bg-white/60 px-1 rounded">POST /v1/YOUR_PHONE_NUMBER_ID/messages</code> — not{" "}
              <code className="text-xs bg-white/60 px-1 rounded">/v1/whatsapp/messages</code>.
            </li>
            <li>
              <strong>Videh users only:</strong> Recipients must have the Videh app installed with the same Indian
              mobile number (<code className="text-xs">91XXXXXXXXXX</code>).
            </li>
            <li>
              <strong>Template variables:</strong> If body has <code className="text-xs">{`{{1}}`}</code>, send{" "}
              <code className="text-xs">components</code> with <code className="text-xs">type: &quot;body&quot;</code>{" "}
              parameters. TEXT headers with variables need <code className="text-xs">type: &quot;header&quot;</code>{" "}
              parameters too.
            </li>
          </ul>
        </div>
      </div>

      {/* Env */}
      <section className="space-y-3">
        <h3 className="font-bold text-[#14131F] text-lg">1. Environment variables (.env)</h3>
        <p className="text-sm text-[#667781]">
          Add these on your server, VPS, Vercel, Railway, or Supabase project secrets:
        </p>
        <CodeBlock code={envSnippet(ctx)} />
      </section>

      {/* Auth */}
      <section className="space-y-3">
        <h3 className="font-bold text-[#14131F] text-lg">2. Authentication</h3>
        <p className="text-sm text-[#667781]">
          Every request needs an <code className="text-xs bg-gray-100 px-1 rounded">Authorization</code> header:
        </p>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-gray-200 p-4 bg-white">
            <p className="font-semibold text-[#14131F] mb-1">Recommended (Key + Secret)</p>
            <code className="text-xs text-[#5B4FE8] break-all">Authorization: Bearer vsk_…:vsec_…</code>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 bg-white">
            <p className="font-semibold text-[#14131F] mb-1">Secret only</p>
            <code className="text-xs text-[#5B4FE8] break-all">Authorization: Bearer vsec_…</code>
          </div>
        </div>
        <p className="text-sm text-[#667781]">
          Base URL: <code className="text-xs bg-gray-100 px-1 rounded">https://developer.videh.co.in/v1</code> or{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">https://api.videh.co.in/v1</code>
        </p>
      </section>

      {/* Endpoints */}
      <section className="space-y-3">
        <h3 className="font-bold text-[#14131F] text-lg">3. API endpoints</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f2f5] text-left">
                <th className="px-4 py-2.5 font-semibold text-[#14131F]">Method</th>
                <th className="px-4 py-2.5 font-semibold text-[#14131F]">Path</th>
                <th className="px-4 py-2.5 font-semibold text-[#14131F]">Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path + e.method} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-mono text-xs text-[#5B4FE8]">{e.method}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{e.path}</td>
                  <td className="px-4 py-2.5 text-[#667781]">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code examples */}
      <section className="space-y-6">
        <h3 className="font-bold text-[#14131F] text-lg">4. Code examples by language</h3>
        <p className="text-sm text-[#667781]">
          Pick your language tab. All examples use the same REST API — no SDK required.
        </p>

        <LangTabs
          lang={lang}
          onLang={setLang}
          code={meSnippet(lang, ctx)}
          label="Verify credentials — GET /v1/me"
        />

        <LangTabs
          lang={lang}
          onLang={setLang}
          code={templatesSnippet(lang, ctx)}
          label="List approved templates — GET /v1/templates"
        />

        <LangTabs
          lang={lang}
          onLang={setLang}
          code={sendMessageSnippet(lang, ctx)}
          label="Send template message — POST /v1/{phone-number-id}/messages"
        />
      </section>

      {/* Success response */}
      <section className="space-y-3">
        <h3 className="font-bold text-[#14131F] text-lg">5. Success response</h3>
        <CodeBlock
          label="HTTP 200"
          code={`{
  "success": true,
  "data": {
    "id": "vmsg_abc123",
    "status": "sent",
    "to": "919876543210",
    "chat_id": 42,
    "message_id": 108,
    "template": { "name": "order_update", "language": { "code": "en" } },
    "billing": { "charged": true, "amount_inr": 0.35 }
  }
}`}
        />
      </section>

      {/* Errors */}
      <section className="space-y-3">
        <h3 className="font-bold text-[#14131F] text-lg">6. Common errors & fixes</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f0f2f5] text-left">
                <th className="px-4 py-2.5 font-semibold">error.code</th>
                <th className="px-4 py-2.5 font-semibold">HTTP</th>
                <th className="px-4 py-2.5 font-semibold">What to do</th>
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((e) => (
                <tr key={e.code} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-mono text-xs text-red-700">{e.code}</td>
                  <td className="px-4 py-2.5 text-[#667781]">{e.http}</td>
                  <td className="px-4 py-2.5 text-[#667781]">{e.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stacks */}
      <section className="rounded-2xl bg-[#14131F] text-white p-6 md:p-8 space-y-4">
        <h3 className="font-bold text-lg">Works with these platforms</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {[
            "Node.js / Express / Next.js API routes",
            "Java / Spring Boot / Jakarta EE",
            "Kotlin / Android backend (OkHttp, Ktor)",
            "Python / Django / Flask / FastAPI",
            "Go / Gin / Fiber",
            "C# / ASP.NET Core / .NET 8",
            "PHP / Laravel / WordPress plugins",
            "Ruby / Rails / Sinatra",
            "Swift / Vapor (iOS server-side)",
            "Dart / Flutter Cloud Functions",
            "Supabase Edge Functions (Deno)",
            "n8n / Zapier / Make (HTTP module)",
          ].map((item) => (
            <p key={item} className="flex items-start gap-2 text-white/80">
              <CheckCircle2 className="h-4 w-4 text-[#5B4FE8] shrink-0 mt-0.5" />
              {item}
            </p>
          ))}
        </div>
        {!isConsole ? (
          <a
            href="#apply"
            className="inline-flex items-center gap-2 mt-2 text-sm font-semibold text-[#5B4FE8] hover:underline"
          >
            Apply for API access
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </section>
    </div>
  );
}

export function DeveloperUsageGuidePanel({
  phoneNumberId,
  apiKeyId,
}: {
  phoneNumberId?: string;
  apiKeyId?: string;
}) {
  return (
    <section className="w-full min-h-[calc(100dvh-10rem)] rounded-2xl bg-white p-6 md:p-8 lg:p-10 shadow-sm border border-gray-200">
      <DeveloperUsageGuide
        variant="console"
        snippetCtx={{
          phoneNumberId: phoneNumberId ?? undefined,
          keyId: apiKeyId ?? undefined,
        }}
      />
    </section>
  );
}
