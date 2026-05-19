import { useState } from "react";
import { CheckCircle2, Copy, Loader2, MessageSquare } from "lucide-react";

const STORAGE_KEY = "videh_dev_lead_id";

type PortalTemplate = {
  id: number;
  name: string;
  display_name: string;
  category: string;
  language: string;
  body_preview: string;
  variables: string[];
  status: string;
  approved?: boolean;
};

type PortalData = {
  lead: { reference_code: string; status: string; company_name: string };
  account: { api_key_id: string; billing_status: string } | null;
  templates: PortalTemplate[];
  approvedCount: number;
};

export function DeveloperPortal() {
  const [leadId, setLeadId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PortalData | null>(null);

  const load = async () => {
    const id = leadId.trim();
    const ref = reference.trim();
    if (!id || !ref) {
      setError("Enter application ID and reference code from your confirmation email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const [portalRes, tplRes] = await Promise.all([
        fetch(`/api/developer-leads/${id}/portal?reference=${encodeURIComponent(ref)}`),
        fetch(`/api/developer-leads/${id}/templates?reference=${encodeURIComponent(ref)}`),
      ]);
      const portal = (await portalRes.json()) as {
        success?: boolean;
        message?: string;
        lead?: PortalData["lead"];
        account?: PortalData["account"];
      };
      const tpl = (await tplRes.json()) as { templates?: PortalTemplate[]; approvedCount?: number };
      if (!portalRes.ok || !portal.success) {
        setError(portal.message ?? "Application not found");
        setData(null);
        return;
      }
      setData({
        lead: portal.lead!,
        account: portal.account ?? null,
        templates: tpl.templates ?? [],
        approvedCount: tpl.approvedCount ?? 0,
      });
    } catch {
      setError("Could not load. Try again later.");
      setData(null);
    } finally {
      setBusy(false);
    }
  };

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <section id="portal" className="py-16 px-4 bg-white border-t border-gray-100">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-[#111b21] mb-2 flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-[#00a884]" />
          Track application &amp; templates
        </h2>
        <p className="text-[#667781] text-sm mb-6">
          After approval, use your reference code to see API key ID and approved template names for your website
          integration.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <input
            type="text"
            placeholder="Application ID"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
          />
          <input
            type="text"
            placeholder="Reference e.g. DEV-A1B2C3"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono"
          />
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 bg-[#00a884] text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load status"}
        </button>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        {data ? (
          <div className="mt-8 rounded-2xl border border-gray-200 p-6 space-y-6">
            <div>
              <p className="text-sm text-[#667781]">
                <strong className="text-[#111b21]">{data.lead.company_name}</strong> ·{" "}
                <span className="font-mono text-[#00a884]">{data.lead.reference_code}</span>
              </p>
              <p className="text-sm mt-1">
                Status: <strong>{data.lead.status}</strong>
              </p>
            </div>

            {data.account ? (
              <div className="rounded-xl bg-[#f0f2f5] p-4 text-sm">
                <p className="font-semibold text-[#111b21] mb-2">API credentials</p>
                <p>
                  Key ID: <code className="bg-white px-1 rounded">{data.account.api_key_id}</code>
                  <button
                    type="button"
                    className="ml-2 text-[#00a884]"
                    onClick={() => copyText(String(data.account!.api_key_id))}
                    aria-label="Copy key ID"
                  >
                    <Copy className="h-3.5 w-3.5 inline" />
                  </button>
                </p>
                <p className="mt-1 text-[#667781]">
                  Billing: {data.account.billing_status}. Secret was shown once on approval — contact
                  developer@videh.co.in to rotate.
                </p>
                <p className="mt-3 text-xs text-[#667781]">
                  List templates: <code>GET https://api.videh.co.in/v1/templates</code> with{" "}
                  <code>Authorization: Bearer vsec_...</code>
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#667781]">API keys appear after full admin approval.</p>
            )}

            <div>
              <p className="font-semibold text-[#111b21] mb-3">
                Message templates ({data.approvedCount} approved)
              </p>
              {data.templates.length === 0 ? (
                <p className="text-sm text-[#667781]">No templates yet. Videh admin adds them during template review.</p>
              ) : (
                <ul className="space-y-3">
                  {data.templates.map((t) => (
                    <li key={t.id} className="rounded-xl border border-gray-100 p-4 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono font-semibold text-[#00a884]">{t.name}</p>
                          <p className="text-[#111b21]">{t.display_name}</p>
                          <p className="text-xs text-[#667781] mt-1">
                            {t.category} · {t.language} · ID {t.id}
                          </p>
                        </div>
                        {t.status === "approved" || t.approved ? (
                          <CheckCircle2 className="h-5 w-5 text-[#00a884] shrink-0" />
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{t.status}</span>
                        )}
                      </div>
                      <p className="text-[#667781] mt-2 text-xs">{t.body_preview}</p>
                      {t.variables?.length ? (
                        <p className="text-xs mt-1 text-[#667781]">Variables: {t.variables.join(", ")}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
