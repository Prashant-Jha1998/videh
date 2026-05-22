import { BadgeCheck, ExternalLink, ImageIcon, Phone, Play } from "lucide-react";
import type { TemplateButton, TemplateDraft } from "../lib/whatsappTemplate";
import { formatBodyForPreview, renderBodyWithSamples } from "../lib/whatsappTemplate";

type Props = {
  draft: TemplateDraft;
  businessName?: string;
  compact?: boolean;
};

function ButtonIcon({ type }: { type: TemplateButton["type"] }) {
  if (type === "URL") return <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  if (type === "PHONE_NUMBER") return <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  return null;
}

export function TemplateWhatsAppPreview({ draft, businessName = "Your Business", compact }: Props) {
  const bodyRendered = renderBodyWithSamples(draft.bodyText || "Type your message body…", draft.variableSamples);
  const bodyLines = formatBodyForPreview(bodyRendered);
  const hasHeader = draft.headerFormat !== "NONE";
  const hasFooter = Boolean(draft.footerText.trim());
  const hasButtons = draft.buttons.length > 0;

  return (
    <div
      className={`chat-doodle flex flex-col w-full rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/50 ${
        compact ? "" : "sticky top-4"
      }`}
      style={{ maxHeight: compact ? "420px" : "min(640px, calc(100dvh - 6rem))" }}
    >
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-[#202c33] border-b border-white/5">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#00a884] to-[#128c7e] flex items-center justify-center text-white font-bold text-sm">
          {businessName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-white text-sm truncate">{businessName}</span>
            <BadgeCheck className="h-4 w-4 text-[#53bdeb] shrink-0" aria-hidden />
          </div>
          <p className="text-[11px] text-[#8696a0]">Business · Template preview</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-2.5">
        <p className="text-center text-[10px] leading-snug text-[#8696a0] bg-[#182229] rounded-lg px-2.5 py-1.5 mx-2">
          How customers see this template on WhatsApp
        </p>

        <div className="bg-[#1f2c34] rounded-xl overflow-hidden w-full max-w-[340px] mx-auto shadow-md">
          {hasHeader && draft.headerFormat === "TEXT" ? (
            <div className="px-3 pt-3 pb-1">
              <p className="text-[13px] font-semibold text-[#e9edef] leading-snug">
                {draft.headerText.trim() || "Header text"}
              </p>
            </div>
          ) : null}

          {hasHeader && draft.headerFormat === "IMAGE" ? (
            <div className="aspect-[16/10] max-h-[140px] w-full bg-[#2a3942] border-b border-white/5 relative overflow-hidden">
              {draft.headerMediaUrl.trim() ? (
                <img
                  src={draft.headerMediaUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 bg-gradient-to-br from-[#00a884]/25 to-[#128c7e]/35">
                <ImageIcon className="h-8 w-8 text-white/70 mb-1" />
                <p className="text-white/90 text-[11px] font-medium">Header image</p>
              </div>
            </div>
          ) : null}

          {hasHeader && (draft.headerFormat === "VIDEO" || draft.headerFormat === "DOCUMENT") ? (
            <div className="aspect-[16/10] max-h-[120px] w-full bg-[#2a3942] border-b border-white/5 flex flex-col items-center justify-center gap-1">
              <Play className="h-8 w-8 text-white/60" />
              <p className="text-[11px] text-[#8696a0]">
                {draft.headerFormat === "VIDEO" ? "Header video" : "Header document"}
              </p>
            </div>
          ) : null}

          <div className={`px-3 py-2 space-y-1.5 text-[12px] text-[#e9edef] leading-snug ${!hasHeader ? "pt-3" : ""}`}>
            {bodyLines.length ? (
              bodyLines.map((line, i) => (
                <p key={i} className="whitespace-pre-wrap break-words">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-[#8696a0] italic">Message body appears here…</p>
            )}
          </div>

          {hasFooter ? (
            <p className="px-3 pb-2 text-[11px] text-[#8696a0]">{draft.footerText}</p>
          ) : null}

          {hasButtons
            ? draft.buttons.map((btn, i) => (
                <button
                  key={`${btn.type}-${i}`}
                  type="button"
                  tabIndex={-1}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[#00a884] text-[13px] font-medium border-t border-white/10 bg-[#1a262d] hover:bg-[#1f2c34]"
                >
                  <ButtonIcon type={btn.type} />
                  {btn.text.trim() || "Button"}
                </button>
              ))
            : null}
        </div>

        <p className="text-[9px] text-[#8696a0] text-right pr-1 pb-1">Template · {draft.language || "en"}</p>
      </div>

      <div className="shrink-0 px-3 py-2 bg-[#202c33] border-t border-white/5">
        <div className="h-8 rounded-full bg-[#2a3942] px-4 flex items-center text-[#8696a0] text-xs">Type a message</div>
      </div>
    </div>
  );
}
