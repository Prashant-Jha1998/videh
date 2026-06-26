import { useState } from "react";
import { Copy, Eye, EyeOff, Loader2, RotateCw } from "lucide-react";
import { devFetch } from "../lib/devFetch";

type Props = {
  leadId: string;
  reference: string;
  apiKeyId: string;
  billingStatus: string;
  phoneNumberId?: string;
  businessAccountId?: string;
};

function buildEnvSnippet(p: {
  apiKeyId: string;
  secret: string | null;
  phoneNumberId?: string;
  businessAccountId?: string;
}): string {
  const secretLine = p.secret ?? "vsec_CLICK_SHOW_ABOVE_THEN_COPY";
  return `# Videh Business API — your website / app .env (server-side only, never in browser)
VIDEH_API_BASE_URL=https://developer.videh.co.in
VIDEH_API_KEY_ID=${p.apiKeyId}
VIDEH_API_SECRET=${secretLine}
VIDEH_PHONE_NUMBER_ID=${p.phoneNumberId ?? "YOUR_PHONE_NUMBER_ID"}
VIDEH_BUSINESS_ACCOUNT_ID=${p.businessAccountId ?? "YOUR_BUSINESS_ACCOUNT_ID"}
`;
}

export function DeveloperApiCredentials({
  leadId,
  reference,
  apiKeyId,
  billingStatus,
  phoneNumberId,
  businessAccountId,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretHint, setSecretHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"key" | "secret" | "env" | null>(null);

  const envSnippet = buildEnvSnippet({
    apiKeyId,
    secret: showSecret && secret ? secret : null,
    phoneNumberId,
    businessAccountId,
  });

  const qs = reference ? `?reference=${encodeURIComponent(reference)}` : "";

  const copyText = async (text: string, which: "key" | "secret" | "env") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  const fetchSecret = async () => {
    if (!leadId) return;
    setBusy(true);
    setError("");
    try {
      const r = await devFetch(`/api/developer-leads/${leadId}/credentials/secret${qs}`);
      const d = (await r.json()) as {
        success?: boolean;
        message?: string;
        apiSecret?: string;
        hasStoredSecret?: boolean;
      };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Could not load secret");
      if (d.apiSecret) {
        setSecret(d.apiSecret);
        setSecretHint(null);
        setShowSecret(true);
      } else {
        setSecret(null);
        setSecretHint(d.message ?? "Reset API secret to store a viewable copy in your console.");
        setShowSecret(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load secret");
    } finally {
      setBusy(false);
    }
  };

  const toggleSecret = async () => {
    if (showSecret) {
      setShowSecret(false);
      return;
    }
    if (secret) {
      setShowSecret(true);
      return;
    }
    await fetchSecret();
  };

  const resetSecret = async () => {
    if (!leadId) return;
    if (
      !window.confirm(
        "Reset API secret?\n\nYour current secret will stop working immediately. Update all apps and servers with the new secret.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await devFetch(`/api/developer-leads/${leadId}/credentials/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference || undefined }),
      });
      const d = (await r.json()) as { success?: boolean; message?: string; apiSecret?: string };
      if (!r.ok || !d.success || !d.apiSecret) throw new Error(d.message ?? "Reset failed");
      setSecret(d.apiSecret);
      setSecretHint(null);
      setShowSecret(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset secret");
    } finally {
      setBusy(false);
    }
  };

  const masked = "•".repeat(40);
  const bearerToken = secret ? `${apiKeyId}:${secret}` : null;

  return (
    <div className="rounded-xl border border-[#5B4FE8]/30 bg-[#5B4FE8]/5 p-4 space-y-4 text-sm">
      <div>
        <p className="font-semibold text-[#14131F]">Production API credentials</p>
        <p className="text-xs text-[#667781] mt-1 leading-relaxed">
          <strong className="text-[#14131F] font-mono text-xs">{apiKeyId}</strong> is only your{" "}
          <strong>Key ID</strong> (public). The real <strong>API Secret</strong> starts with{" "}
          <code className="text-[10px]">vsec_</code> — use that in API requests, never share it publicly.
        </p>
      </div>

      {error ? <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs text-[#667781] uppercase font-semibold">1. API Key ID (vsk_…)</p>
        <p className="text-[11px] text-[#667781] -mt-1">Identifier only — not enough alone to call the API</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-white px-2 py-1 rounded text-xs font-mono break-all">{apiKeyId}</code>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4FE8] hover:underline"
            onClick={() => void copyText(apiKeyId, "key")}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied === "key" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
        <p className="text-xs text-[#667781] uppercase font-semibold">2. API Secret Key (vsec_…)</p>
        <p className="text-[11px] text-[#667781] -mt-1">Password for API — required in Authorization header</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-white px-2 py-1 rounded text-xs font-mono break-all max-w-full border border-amber-100">
            {showSecret && secret ? secret : masked}
          </code>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleSecret()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4FE8] hover:underline disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : showSecret ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {showSecret ? "Hide" : "Show"}
          </button>
          {showSecret && secret ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4FE8] hover:underline"
              onClick={() => void copyText(secret, "secret")}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied === "secret" ? "Copied" : "Copy"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetSecret()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            Reset secret
          </button>
        </div>
        {secretHint && !secret ? (
          <p className="text-xs text-amber-900 bg-amber-100/80 rounded-lg px-2 py-1.5">{secretHint}</p>
        ) : (
          <p className="text-xs text-[#667781]">
            Billing: <strong>{billingStatus}</strong>. Click <strong>Show</strong> to reveal · <strong>Reset secret</strong> if
            you never saved it or it leaked.
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-[#14131F]/10 bg-[#14131F] text-[#e9edef] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-white">Use on your other website / app</p>
            <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">
              Copy into <strong className="text-white/90">.env</strong> on your server (Node, PHP, Laravel, Python).
              Automatic Videh template messages use{" "}
              <code className="text-[10px] text-[#5B4FE8]">POST /v1/&#123;phone-number-id&#125;/messages</code> with an{" "}
              <strong className="text-white/90">approved template</strong>.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4FE8] bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-lg shrink-0"
            onClick={() => void copyText(envSnippet, "env")}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied === "env" ? "Copied" : "Copy .env"}
          </button>
        </div>
        <pre className="mt-2 text-[10px] leading-relaxed font-mono whitespace-pre-wrap break-all bg-black/30 rounded-lg p-3 border border-white/10 overflow-x-auto">
          {envSnippet}
        </pre>
        {!showSecret || !secret ? (
          <p className="text-[10px] text-amber-200/90 mt-2">
            Tip: click <strong>Show</strong> on API Secret above, then copy .env again so{" "}
            <code className="text-[#5B4FE8]">VIDEH_API_SECRET</code> is filled correctly.
          </p>
        ) : null}
        <p className="text-[10px] text-white/45 mt-2">
          Do not put these keys in React/frontend code or public GitHub. Use only backend / hosting environment variables.
        </p>
      </div>

      {showSecret && secret && bearerToken ? (
        <div className="space-y-2 pt-1 border-t border-[#5B4FE8]/20">
          <p className="text-xs text-[#667781] uppercase font-semibold">Use in HTTP requests</p>
          <code className="block bg-white px-2 py-2 rounded text-[11px] font-mono break-all border border-gray-100">
            Authorization: Bearer {bearerToken}
          </code>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4FE8] hover:underline"
            onClick={() => void copyText(`Bearer ${bearerToken}`, "secret")}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy full Authorization header
          </button>
          <p className="text-[11px] text-[#667781]">
            Or send only the secret: <code>Authorization: Bearer {secret.slice(0, 12)}…</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}
