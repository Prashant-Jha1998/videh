import { BadgeCheck, ExternalLink, ImageIcon, Phone, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { HeaderMediaValidation } from "../lib/templateHeaderMedia";
import { headerMediaSpecs, TEMPLATE_HEADER_MEDIA_LABEL } from "../lib/templateHeaderMedia";
import type { TemplateButton, TemplateDraft } from "../lib/videhTemplate";
import { formatBodyForPreview, renderBodyWithSamples } from "../lib/videhTemplate";

type Props = {
  draft: TemplateDraft;
  businessName?: string;
  compact?: boolean;
  headerMediaValidation?: HeaderMediaValidation;
};

function ButtonIcon({ type }: { type: TemplateButton["type"] }) {
  if (type === "URL") return <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  if (type === "PHONE_NUMBER") return <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  return null;
}

function MediaPlaceholder({
  kind,
  hint,
}: {
  kind: "image" | "video" | "document";
  hint?: string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3 bg-gradient-to-br from-[#00a884]/25 to-[#128c7e]/35">
      {kind === "video" ? (
        <Play className="h-8 w-8 text-white/70 mb-1" />
      ) : (
        <ImageIcon className="h-8 w-8 text-white/70 mb-1" />
      )}
      <p className="text-white/90 text-[11px] font-medium">
        {kind === "image" ? "Header image" : kind === "video" ? "Header video" : "Header document"}
      </p>
      {hint ? <p className="text-white/70 text-[10px] mt-1">{hint}</p> : null}
    </div>
  );
}

export function TemplateVidehPreview({
  draft,
  businessName = "Your Business",
  compact,
  headerMediaValidation,
}: Props) {
  const bodyRendered = renderBodyWithSamples(draft.bodyText || "Type your message body…", draft.variableSamples);
  const bodyLines = formatBodyForPreview(bodyRendered);
  const hasHeader = draft.headerFormat !== "NONE";
  const hasFooter = Boolean(draft.footerText.trim());
  const hasButtons = draft.buttons.length > 0;
  const mediaUrl = draft.headerMediaUrl.trim();

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setVideoReady(false);
    setVideoError(false);
  }, [mediaUrl, draft.headerFormat]);

  const mediaFrameClass =
    "w-full bg-[#2a3942] border-b border-white/5 relative overflow-hidden aspect-[800/418] max-h-[160px]";

  const isMediaHeader = draft.headerFormat === "IMAGE" || draft.headerFormat === "VIDEO";
  const mediaSpecs = isMediaHeader ? headerMediaSpecs(draft.headerFormat) : null;
  const mediaKindLabel = draft.headerFormat === "VIDEO" ? "Video" : "Image";
  const defaultDimensionHint = mediaSpecs
    ? `Required ${mediaKindLabel.toLowerCase()} size: ${mediaSpecs.width}×${mediaSpecs.height} px (${TEMPLATE_HEADER_MEDIA_LABEL})`
    : "";

  const validationHint =
    headerMediaValidation?.state === "invalid" || headerMediaValidation?.state === "error"
      ? headerMediaValidation.message
      : headerMediaValidation?.state === "loading"
        ? "Checking dimensions…"
        : headerMediaValidation?.state === "valid"
          ? `Dimensions OK — ${headerMediaValidation.width}×${headerMediaValidation.height} px`
          : defaultDimensionHint;

  const hintTone =
    headerMediaValidation?.state === "valid"
      ? "info"
      : headerMediaValidation?.state === "loading"
        ? "muted"
        : headerMediaValidation?.state === "invalid" || headerMediaValidation?.state === "error"
          ? "error"
          : "hint";

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
          How customers see this template on Videh
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
            <div className={mediaFrameClass}>
              {mediaUrl && !imageError ? (
                <img
                  src={mediaUrl}
                  alt=""
                  className={`w-full h-full object-cover transition-opacity ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              ) : null}
              {!mediaUrl || imageError || !imageLoaded ? (
                <MediaPlaceholder
                  kind="image"
                  hint={
                    imageError
                      ? "Image failed to load"
                      : !mediaUrl
                        ? defaultDimensionHint
                        : undefined
                  }
                />
              ) : null}
            </div>
          ) : null}

          {hasHeader && draft.headerFormat === "VIDEO" ? (
            <div className={mediaFrameClass}>
              {mediaUrl && !videoError ? (
                <video
                  src={mediaUrl}
                  className={`w-full h-full object-cover bg-black transition-opacity ${videoReady ? "opacity-100" : "opacity-0"}`}
                  controls
                  playsInline
                  preload="metadata"
                  muted
                  onLoadedData={() => setVideoReady(true)}
                  onError={() => setVideoError(true)}
                />
              ) : null}
              {!mediaUrl || videoError || !videoReady ? (
                <MediaPlaceholder
                  kind="video"
                  hint={
                    videoError
                      ? "Video failed to load"
                      : !mediaUrl
                        ? defaultDimensionHint
                        : undefined
                  }
                />
              ) : null}
            </div>
          ) : null}

          {hasHeader && draft.headerFormat === "DOCUMENT" ? (
            <div className={mediaFrameClass}>
              <MediaPlaceholder kind="document" />
            </div>
          ) : null}

          {isMediaHeader ? (
            <p
              className={`px-3 py-2 text-[10px] leading-snug border-b border-white/5 ${
                hintTone === "info"
                  ? "text-[#53bdeb] bg-[#53bdeb]/10"
                  : hintTone === "muted"
                    ? "text-[#8696a0] bg-[#182229]"
                    : hintTone === "error"
                      ? "text-[#f15c6d] bg-[#f15c6d]/10"
                      : "text-[#e9edef] bg-[#00a884]/15"
              }`}
            >
              {validationHint}
            </p>
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
