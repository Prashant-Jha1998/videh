import { useState } from "react";
import { Copy, Eye, EyeOff, Loader2, RotateCw } from "lucide-react";
import { devFetch } from "../lib/devFetch";

type Props = {
  leadId: string;
  reference: string;
  apiKeyId: string;
  billingStatus: string;
};

export function DeveloperApiCredentials({ leadId, reference, apiKeyId, billingStatus }: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretHint, setSecretHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"key" | "secret" | null>(null);

  const qs = reference ? `?reference=${encodeURIComponent(reference)}` : "";

  const copyText = async (text: string, which: "key" | "secret") => {
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

  const masked = "•".repeat(32);

  return (
    <div className="rounded-xl border border-[#00a884]/30 bg-[#00a884]/5 p-4 space-y-3 text-sm">
      <p className="font-semibold text-[#111b21]">Production API credentials</p>

      {error ? <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs text-[#667781] uppercase font-semibold">API Key ID</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-white px-2 py-1 rounded text-xs font-mono break-all">{apiKeyId}</code>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#00a884] hover:underline"
            onClick={() => void copyText(apiKeyId, "key")}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied === "key" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[#667781] uppercase font-semibold">API Secret</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-white px-2 py-1 rounded text-xs font-mono break-all max-w-full">
            {showSecret && secret ? secret : masked}
          </code>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleSecret()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#00a884] hover:underline disabled:opacity-60"
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00a884] hover:underline"
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
          <p className="text-xs text-[#667781]">{secretHint}</p>
        ) : (
          <p className="text-xs text-[#667781]">
            Billing status: <strong>{billingStatus}</strong>. Keep your secret private. Use Reset if it was leaked.
          </p>
        )}
      </div>
    </div>
  );
}
