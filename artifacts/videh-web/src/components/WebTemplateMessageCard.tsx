import { ExternalLink, FileText, Phone, Play } from "lucide-react";
import { useState } from "react";
import type { BusinessTemplateButton, BusinessTemplatePayload } from "../lib/businessTemplateMessage";
import {
  normalizeExternalUrl,
  normalizePhoneDialUri,
  shouldShowReadMore,
  truncateTemplateBody,
} from "../lib/businessTemplateMessage";

function ButtonIcon({ type }: { type: BusinessTemplateButton["type"] }) {
  if (type === "URL") return <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  if (type === "PHONE_NUMBER") return <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  return null;
}

type Props = {
  payload: BusinessTemplatePayload;
  onQuickReply?: (text: string) => void;
};

export function WebTemplateMessageCard({ payload, onQuickReply }: Props) {
  const [expanded, setExpanded] = useState(false);
  const body = payload.body.trim();
  const showReadMore = shouldShowReadMore(body);
  const bodyDisplay = expanded || !showReadMore ? body : truncateTemplateBody(body);
  const header = payload.header;

  const handleButton = (btn: BusinessTemplateButton) => {
    if (btn.type === "URL" && btn.url) {
      window.open(normalizeExternalUrl(btn.url), "_blank", "noopener,noreferrer");
      return;
    }
    if (btn.type === "PHONE_NUMBER" && btn.phone_number) {
      window.location.href = normalizePhoneDialUri(btn.phone_number);
      return;
    }
    if (btn.type === "QUICK_REPLY" && btn.text.trim()) {
      onQuickReply?.(btn.text.trim());
    }
  };

  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
      {header?.format === "TEXT" && header.text ? (
        <p className="px-3 pt-3 text-[15px] font-semibold leading-snug text-[#111B21]">{header.text}</p>
      ) : null}

      {header?.format === "IMAGE" && header.mediaUrl ? (
        <div className="relative aspect-[800/418] max-h-[180px] w-full overflow-hidden bg-[#2A2838]">
          <img src={header.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : null}

      {header?.format === "VIDEO" && header.mediaUrl ? (
        <div className="relative aspect-[800/418] max-h-[180px] w-full overflow-hidden bg-black">
          <video src={header.mediaUrl} className="h-full w-full object-cover" controls playsInline preload="metadata" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play className="h-10 w-10 text-white/80" aria-hidden />
          </div>
        </div>
      ) : null}

      {header?.format === "DOCUMENT" && header.mediaUrl ? (
        <a
          href={header.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 border-b border-black/5 bg-[#5B4FE8]/5 px-3 py-3 hover:bg-[#5B4FE8]/10"
        >
          <FileText className="h-7 w-7 shrink-0 text-[#5B4FE8]" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#111B21]">
            {header.documentName?.trim() || "Document"}
          </span>
        </a>
      ) : null}

      {body ? (
        <div className={`px-3 py-2 ${!header ? "pt-3" : ""}`}>
          <p className="whitespace-pre-wrap text-[14px] leading-snug text-[#111B21]">{bodyDisplay}</p>
          {showReadMore ? (
            <button
              type="button"
              className="mt-1 text-sm font-semibold text-[#5B4FE8] hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Read less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : null}

      {payload.footer ? (
        <p className="px-3 pb-2 text-xs text-[#667781]">{payload.footer}</p>
      ) : null}

      {payload.buttons.length > 0 ? (
        <div className="border-t border-black/8">
          {payload.buttons.map((btn, i) => (
            <button
              key={`${btn.type}-${i}-${btn.text}`}
              type="button"
              className="flex w-full items-center justify-center gap-1.5 border-t border-black/6 bg-[#5B4FE8]/5 py-2.5 text-[13px] font-semibold text-[#5B4FE8] first:border-t-0 hover:bg-[#5B4FE8]/10"
              onClick={() => handleButton(btn)}
            >
              <ButtonIcon type={btn.type} />
              {btn.text.trim() || "Button"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
