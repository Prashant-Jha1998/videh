import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Loader2,
  MessageSquarePlus,
  Plus,
  Send,
  Trash2,
  Variable,
} from "lucide-react";
import { devFetch } from "../lib/devFetch";
import type { PortalTemplate } from "../hooks/useDeveloperPortal";
import {
  EMPTY_TEMPLATE_DRAFT,
  extractVariableIndexes,
  type TemplateButton,
  type TemplateDraft,
  draftFromPortalTemplate,
} from "../lib/videhTemplate";
import { useHeaderMediaValidation } from "../hooks/useHeaderMediaValidation";
import {
  headerMediaBlocksSubmit,
  headerMediaSpecs,
  TEMPLATE_HEADER_MEDIA_LABEL,
} from "../lib/templateHeaderMedia";
import { TemplateVidehPreview } from "./TemplateVidehPreview";

type Props = {
  leadId: string;
  reference: string;
  businessName?: string;
  templates: PortalTemplate[];
  onReload: () => Promise<void>;
  onError: (msg: string) => void;
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "hi", label: "Hindi" },
];

function emptyButton(type: TemplateButton["type"]): TemplateButton {
  if (type === "URL") return { type, text: "", url: "https://" };
  if (type === "PHONE_NUMBER") return { type, text: "Call us", phone_number: "+91" };
  return { type, text: "" };
}

export function DeveloperTemplateBuilder({
  leadId,
  reference,
  businessName,
  templates,
  onReload,
  onError,
}: Props) {
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);

  const variableIndexes = useMemo(() => extractVariableIndexes(draft.bodyText), [draft.bodyText]);
  const headerMediaValidation = useHeaderMediaValidation(draft.headerFormat, draft.headerMediaUrl);

  useEffect(() => {
    setDraft((d) => {
      const next = { ...d.variableSamples };
      let changed = false;
      for (const idx of variableIndexes) {
        if (!(idx in next)) {
          next[idx] = idx === "1" ? "Customer" : idx === "2" ? "ORD-12345" : `Sample ${idx}`;
          changed = true;
        }
      }
      return changed ? { ...d, variableSamples: next } : d;
    });
  }, [variableIndexes]);

  const viewing = viewId ? templates.find((t) => t.id === viewId) : null;
  const previewDraft = viewing ? draftFromPortalTemplate(viewing) : draft;

  const submitTemplate = async () => {
    const id = leadId.trim();
    if (!id) return;
    if (!draft.templateKey.trim() || !draft.bodyText.trim()) {
      onError("Template name (key) and message body are required.");
      return;
    }
    if (draft.headerFormat === "TEXT" && !draft.headerText.trim()) {
      onError("Enter header text or set header to None.");
      return;
    }
    const mediaError = headerMediaBlocksSubmit(
      draft.headerFormat,
      draft.headerMediaUrl,
      headerMediaValidation,
    );
    if (mediaError) {
      onError(mediaError);
      return;
    }
    setSubmitting(true);
    onError("");
    try {
      const variables = variableIndexes.map((i) => draft.variableSamples[i]?.trim() || `var_${i}`);
      const r = await devFetch(`/api/developer-leads/${id}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: reference.trim() || undefined,
          templateKey: draft.templateKey,
          name: draft.name || draft.templateKey,
          category: draft.category,
          language: draft.language,
          headerFormat: draft.headerFormat,
          headerText: draft.headerText,
          headerMediaUrl: draft.headerMediaUrl,
          bodyText: draft.bodyText,
          footerText: draft.footerText,
          buttons: draft.buttons.filter((b) => b.text.trim()),
          variables,
          variableSamples: draft.variableSamples,
        }),
      });
      const d = (await r.json()) as { success?: boolean; message?: string };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Submit failed");
      setDraft(EMPTY_TEMPLATE_DRAFT);
      setViewId(null);
      await onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not submit template");
    } finally {
      setSubmitting(false);
    }
  };

  const loadRejected = (t: PortalTemplate) => {
    if (t.status !== "rejected") return;
    setDraft(draftFromPortalTemplate(t));
    setViewId(null);
  };

  const updateButton = (index: number, patch: Partial<TemplateButton>) => {
    setDraft((d) => ({
      ...d,
      buttons: d.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  };

  const addButton = (type: TemplateButton["type"]) => {
    if (draft.buttons.length >= 3) return;
    setDraft((d) => ({ ...d, buttons: [...d.buttons, emptyButton(type)] }));
  };

  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-[1fr_minmax(280px,360px)] gap-6 lg:gap-8 items-start">
        <div className="space-y-6 min-w-0">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-[#00a884]">
              <MessageSquarePlus className="h-5 w-5" />
              <h3 className="font-bold text-[#111b21]">Create template</h3>
            </div>
            <p className="text-sm text-[#667781]">
              Build like Videh Business templates: header, body with {"{{1}}"} variables, optional footer, and
              buttons. Live preview updates on the right.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#667781]">Template name (key) *</span>
                <input
                  value={draft.templateKey}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      templateKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                    }))
                  }
                  placeholder="order_update"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
                />
                <span className="text-[10px] text-[#667781]">Lowercase, numbers, underscores only</span>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#667781]">Display name</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Order update"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#667781]">Category</span>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="utility">Utility</option>
                  <option value="marketing">Marketing</option>
                  <option value="authentication">Authentication</option>
                  <option value="service">Service</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#667781]">Language</span>
                <select
                  value={draft.language}
                  onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <h4 className="font-semibold text-[#111b21]">Header</h4>
            <div className="flex flex-wrap gap-2">
              {(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      headerFormat: fmt,
                      headerMediaUrl: fmt === "IMAGE" || fmt === "VIDEO" ? d.headerMediaUrl : "",
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    draft.headerFormat === fmt
                      ? "bg-[#00a884] text-white border-[#00a884]"
                      : "border-gray-200 text-[#667781] hover:border-[#00a884]/40"
                  }`}
                >
                  {fmt === "NONE" ? "None" : fmt.charAt(0) + fmt.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {draft.headerFormat === "TEXT" ? (
              <input
                value={draft.headerText}
                onChange={(e) => setDraft((d) => ({ ...d, headerText: e.target.value.slice(0, 60) }))}
                placeholder="Header text (max 60 chars)"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            ) : null}
            {draft.headerFormat === "IMAGE" || draft.headerFormat === "VIDEO" ? (
              <div className="space-y-2">
                <input
                  value={draft.headerMediaUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, headerMediaUrl: e.target.value }))}
                  placeholder={
                    draft.headerFormat === "IMAGE" ? "Image URL (https://…)" : "Video URL (https://… .mp4)"
                  }
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${
                    headerMediaValidation.state === "invalid" || headerMediaValidation.state === "error"
                      ? "border-red-300 bg-red-50/40"
                      : headerMediaValidation.state === "valid"
                        ? "border-[#00a884]/50"
                        : "border-gray-200"
                  }`}
                />
                <p className="text-[11px] text-[#667781]">
                  Required size: <strong>{TEMPLATE_HEADER_MEDIA_LABEL}</strong> (
                  {headerMediaSpecs(draft.headerFormat).width}×{headerMediaSpecs(draft.headerFormat).height} pixels).
                  {draft.headerFormat === "IMAGE" ? " Use JPG or PNG." : " Use MP4."}
                </p>
                {headerMediaValidation.state === "loading" ? (
                  <p className="text-[11px] text-[#667781]">Checking media dimensions…</p>
                ) : null}
                {headerMediaValidation.state === "valid" ? (
                  <p className="text-[11px] text-[#00a884] font-medium">
                    Dimensions OK — {headerMediaValidation.width}×{headerMediaValidation.height} px
                  </p>
                ) : null}
                {headerMediaValidation.state === "invalid" || headerMediaValidation.state === "error" ? (
                  <p className="text-[11px] text-red-600 font-medium">{headerMediaValidation.message}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <h4 className="font-semibold text-[#111b21]">Body *</h4>
            <textarea
              value={draft.bodyText}
              onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
              rows={6}
              placeholder="Hello {{1}}, your order {{2}} is confirmed."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-y font-mono leading-relaxed"
            />
            <p className="text-xs text-[#667781]">
              Use {"{{1}}"}, {"{{2}}"} for dynamic fields (numbered variables).
            </p>

            {variableIndexes.length > 0 ? (
              <div className="rounded-xl bg-[#f0f2f5] p-4 space-y-3">
                <p className="text-xs font-semibold text-[#111b21] flex items-center gap-1">
                  <Variable className="h-3.5 w-3.5 text-[#00a884]" />
                  Sample values (for preview &amp; admin review)
                </p>
                {variableIndexes.map((idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-[#00a884] w-10 shrink-0">{`{{${idx}}}`}</span>
                    <input
                      value={draft.variableSamples[idx] ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          variableSamples: { ...d.variableSamples, [idx]: e.target.value },
                        }))
                      }
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                      placeholder={`Sample for variable ${idx}`}
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-3">
            <h4 className="font-semibold text-[#111b21]">Footer (optional)</h4>
            <input
              value={draft.footerText}
              onChange={(e) => setDraft((d) => ({ ...d, footerText: e.target.value.slice(0, 60) }))}
              placeholder="e.g. Reply STOP to unsubscribe"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-[#111b21]">Buttons (max 3)</h4>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={draft.buttons.length >= 3}
                  onClick={() => addButton("QUICK_REPLY")}
                  className="text-xs font-semibold text-[#00a884] px-2 py-1 rounded-lg border border-[#00a884]/30 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3 inline" /> Quick reply
                </button>
                <button
                  type="button"
                  disabled={draft.buttons.length >= 3}
                  onClick={() => addButton("URL")}
                  className="text-xs font-semibold text-[#00a884] px-2 py-1 rounded-lg border border-[#00a884]/30 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3 inline" /> URL
                </button>
                <button
                  type="button"
                  disabled={draft.buttons.length >= 3}
                  onClick={() => addButton("PHONE_NUMBER")}
                  className="text-xs font-semibold text-[#00a884] px-2 py-1 rounded-lg border border-[#00a884]/30 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3 inline" /> Call
                </button>
              </div>
            </div>
            {draft.buttons.map((btn, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-end p-3 rounded-xl bg-[#fafafa] border border-gray-100">
                <select
                  value={btn.type}
                  onChange={(e) => updateButton(i, emptyButton(e.target.value as TemplateButton["type"]))}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                >
                  <option value="QUICK_REPLY">Quick reply</option>
                  <option value="URL">Visit website</option>
                  <option value="PHONE_NUMBER">Call phone</option>
                </select>
                <input
                  value={btn.text}
                  onChange={(e) => updateButton(i, { text: e.target.value.slice(0, 25) })}
                  placeholder="Button label"
                  className="flex-1 min-w-[120px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                />
                {btn.type === "URL" ? (
                  <input
                    value={btn.url ?? ""}
                    onChange={(e) => updateButton(i, { url: e.target.value })}
                    placeholder="https://"
                    className="flex-1 min-w-[160px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-mono text-xs"
                  />
                ) : null}
                {btn.type === "PHONE_NUMBER" ? (
                  <input
                    value={btn.phone_number ?? ""}
                    onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                    placeholder="+91…"
                    className="w-36 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-mono text-xs"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, j) => j !== i) }))}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  aria-label="Remove button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitTemplate()}
            className="w-full flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white font-semibold py-3.5 rounded-xl disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            Submit for Videh approval
          </button>
        </div>

        <div className="lg:sticky lg:top-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#667781] flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-[#00a884]" />
            Live preview
          </p>
          {previewDraft.headerFormat === "IMAGE" || previewDraft.headerFormat === "VIDEO" ? (
            <p className="text-[11px] text-[#667781] leading-relaxed rounded-xl bg-[#e7f9f3] border border-[#00a884]/20 px-3 py-2">
              <strong className="text-[#111b21]">Header {previewDraft.headerFormat.toLowerCase()}:</strong> must be{" "}
              <strong className="text-[#00a884]">{TEMPLATE_HEADER_MEDIA_LABEL}</strong> (
              {headerMediaSpecs(previewDraft.headerFormat).width}×{headerMediaSpecs(previewDraft.headerFormat).height}{" "}
              pixels). Wrong size will show an error and block submit.
            </p>
          ) : null}
          <TemplateVidehPreview
            draft={previewDraft}
            businessName={businessName}
            headerMediaValidation={viewing ? undefined : headerMediaValidation}
          />
          <p className="text-[11px] text-[#667781] text-center">
            Category: <strong>{previewDraft.category}</strong> · Language: <strong>{previewDraft.language}</strong>
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm">
        <h3 className="font-bold text-[#111b21] mb-4">Your templates</h3>
        {!templates.length ? (
          <p className="text-sm text-[#667781]">No templates yet. Create your first template above.</p>
        ) : (
          <ul className="space-y-4">
            {templates.map((t) => (
              <li key={t.id} className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono font-semibold text-[#00a884]">{t.name}</p>
                    <p className="text-[#111b21] font-medium">{t.display_name}</p>
                    <p className="text-xs text-[#667781] mt-1">
                      {t.category} · {t.language}
                      {t.header_format && t.header_format !== "NONE" ? ` · ${t.header_format} header` : ""}
                      {t.buttons?.length ? ` · ${t.buttons.length} button(s)` : ""}
                    </p>
                    <span
                      className={`inline-block mt-2 text-xs px-2 py-0.5 rounded font-medium ${
                        t.status === "approved" || t.approved
                          ? "bg-[#00a884]/10 text-[#00a884]"
                          : t.status === "rejected"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {t.approved || t.status === "approved" ? "Approved" : t.status}
                    </span>
                    {t.rejection_reason ? (
                      <p className="text-xs text-red-600 mt-1">Reason: {t.rejection_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setViewId(viewId === t.id ? null : t.id)}
                      className="text-xs font-semibold text-[#00a884] px-3 py-1.5 rounded-lg border border-[#00a884]/30"
                    >
                      {viewId === t.id ? "Hide preview" : "Preview"}
                    </button>
                    {t.status === "rejected" ? (
                      <button
                        type="button"
                        onClick={() => loadRejected(t)}
                        className="text-xs font-semibold text-[#111b21] px-3 py-1.5 rounded-lg border border-gray-200"
                      >
                        Edit &amp; resubmit
                      </button>
                    ) : null}
                  </div>
                </div>
                {viewId === t.id ? (
                  <div className="px-4 pb-4 grid md:grid-cols-2 gap-4 border-t border-gray-100 pt-4 bg-[#fafafa]">
                    <TemplateVidehPreview
                      draft={draftFromPortalTemplate(t)}
                      businessName={businessName}
                      compact
                    />
                    <div className="text-xs text-[#667781] space-y-2 font-mono">
                      <p className="font-sans font-semibold text-[#111b21] text-sm">API send example</p>
                      <pre className="bg-white p-3 rounded-lg border border-gray-200 overflow-x-auto text-[10px] leading-relaxed">
                        {`"template": {
  "name": "${t.name}",
  "language": { "code": "${t.language}" },
  "components": [
    { "type": "body", "parameters": [
${(t.variable_indexes ?? []).map((i) => `      { "type": "text", "text": "${t.variable_samples?.[i] ?? "…"}" }`).join(",\n")}
    ]}
  ]
}`}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
