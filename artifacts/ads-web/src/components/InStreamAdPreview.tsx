import React, { useCallback, useEffect, useRef, useState } from "react";

export type InStreamAdPreviewProps = {
  videoSrc?: string;
  iconSrc?: string;
  headline: string;
  subtitle: string;
  description: string;
  ctaLabel: string;
  isAppInstall?: boolean;
  appPriceLabel?: string;
  appRating?: string;
  appReviewCount?: string;
  appDownloadCount?: string;
  appCategory?: string;
  promoImages?: string[];
  destinationHint?: string;
};

type VideoShape = "landscape" | "portrait" | "square";

function detectShape(w: number, h: number): VideoShape {
  if (!w || !h) return "landscape";
  const ratio = w / h;
  if (ratio < 0.85) return "portrait";
  if (ratio > 1.15) return "landscape";
  return "square";
}

export function InStreamAdPreview({
  videoSrc,
  iconSrc,
  headline,
  subtitle,
  description,
  ctaLabel,
  isAppInstall,
  appPriceLabel,
  appRating,
  appReviewCount,
  appDownloadCount,
  appCategory,
  promoImages = [],
  destinationHint,
}: InStreamAdPreviewProps) {
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [adFinished, setAdFinished] = useState(false);
  const [videoShape, setVideoShape] = useState<VideoShape>("landscape");
  const dragStartY = useRef(0);
  const dragStartExpanded = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const onVideoMeta = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    setVideoShape(detectShape(v.videoWidth, v.videoHeight));
  }, []);

  const togglePanel = useCallback(() => {
    setPanelExpanded((v) => !v);
  }, []);

  const onSheetPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragStartExpanded.current = panelExpanded;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSheetPointerMove = (e: React.PointerEvent) => {
    if (!e.buttons) return;
    const dy = e.clientY - dragStartY.current;
    if (dy < -28) setPanelExpanded(true);
    if (dy > 28) setPanelExpanded(false);
  };

  const onSheetWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 8) setPanelExpanded(true);
    if (e.deltaY < -8) setPanelExpanded(false);
  };

  useEffect(() => {
    if (adFinished) setPanelExpanded(false);
  }, [adFinished]);

  const gridItems = promoImages.length > 0
    ? promoImages.map((src, i) => ({ src, label: i === 0 ? subtitle : "Product" }))
    : [
        { src: iconSrc, label: subtitle },
        { src: undefined, label: "Featured" },
        { src: undefined, label: "Offer" },
        { src: undefined, label: "New" },
      ];

  if (adFinished) {
    return (
      <div className="yt-phone-preview">
        <div className="yt-phone-screen yt-phone-screen--watch">
          <div className={`yt-watch-video yt-watch-video--${videoShape}`}>
            {videoSrc ? (
              <video
                src={videoSrc}
                className="yt-watch-video-el"
                muted
                playsInline
                loop
                autoPlay
                onLoadedMetadata={onVideoMeta}
              />
            ) : (
              <div className="yt-watch-video-ph" />
            )}
          </div>
          <div className="yt-watch-meta">
            <h4 className="yt-watch-title">{headline || "Your video title"}</h4>
            <div className="yt-watch-channel">
              <span className="yt-watch-avatar" />
              <div>
                <div className="yt-watch-channel-name">{subtitle}</div>
                <div className="yt-watch-stats">30K likes · 7.5 lakh views · 1 day ago</div>
              </div>
            </div>
            <div className="yt-watch-actions" aria-hidden="true">
              <span>Join</span>
              <span>👍</span>
              <span>👎</span>
              <span>Share</span>
              <span>⋮</span>
            </div>
            <div className="yt-watch-comments">
              <strong>Comments 790</strong>
              <div className="yt-watch-comment-ph">Add a comment…</div>
            </div>
          </div>
          <div className="yt-watch-feed-ad">
            <div className="yt-watch-feed-ad-label">Sponsored</div>
            <div className="yt-watch-feed-ad-card">
              {iconSrc ? <img src={iconSrc} alt="" /> : <div className="yt-watch-feed-ad-img-ph" />}
              <div>
                <strong>{headline}</strong>
                <p>{description || "Your ad on the home feed"}</p>
              </div>
            </div>
          </div>
          <button type="button" className="yt-preview-replay" onClick={() => setAdFinished(false)}>
            ↺ Replay ad preview
          </button>
        </div>
        <p className="ads-preview-hint">After skip — main video resumes (after the skip timer)</p>
      </div>
    );
  }

  return (
    <div className="yt-phone-preview">
      <div
        className={[
          "yt-phone-screen",
          "yt-phone-screen--ad",
          panelExpanded ? "yt-phone-screen--panel-open" : "",
          `yt-phone-screen--video-${videoShape}`,
        ].join(" ")}
      >
        <div className="yt-ad-video-zone">
          {videoSrc ? (
            <video
              src={videoSrc}
              className={`yt-ad-video-el yt-ad-video-el--${videoShape}`}
              muted
              playsInline
              loop
              autoPlay
              onLoadedMetadata={onVideoMeta}
            />
          ) : (
            <div className="yt-ad-video-ph" />
          )}
          <div className="yt-ad-video-overlay" aria-hidden="true">
            <div className="yt-ad-video-top">
              <span className="yt-ad-visit">Visit advertiser</span>
            </div>
            <div className="yt-ad-video-bottom-wrap">
              <div className="yt-ad-video-bottom">
                <span className="yt-ad-sponsored">Sponsored ⓘ</span>
                <button type="button" className="yt-ad-skip" onClick={() => setAdFinished(true)}>
                  Skip ad ▶
                </button>
              </div>
              <div className="yt-ad-progress">
                <div className="yt-ad-progress-fill" />
              </div>
            </div>
          </div>
        </div>

        <div
          ref={sheetRef}
          className={["yt-ad-sheet", panelExpanded ? "yt-ad-sheet--open" : "yt-ad-sheet--collapsed"].join(" ")}
          onWheel={onSheetWheel}
        >
          <div
            className="yt-ad-sheet-handle"
            role="button"
            tabIndex={0}
            aria-label={panelExpanded ? "Collapse ad details" : "Expand ad details"}
            onClick={togglePanel}
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") togglePanel();
            }}
          />
          <div className="yt-ad-sheet-header">
            <strong>Sponsored</strong>
            <div className="yt-ad-sheet-header-actions">
              <span aria-hidden="true">⋮</span>
              <button type="button" className="yt-ad-sheet-close" aria-label="Close" onClick={() => setAdFinished(true)}>
                ×
              </button>
            </div>
          </div>

          <div className="yt-ad-sheet-scroll">
            {panelExpanded ? (
              <>
                <div className="yt-ad-product-grid">
                  {gridItems.slice(0, 4).map((item, idx) => (
                    <div key={`${item.label}-${idx}`} className="yt-ad-product-cell">
                      {item.src ? (
                        <img src={item.src} alt="" className="yt-ad-product-img" />
                      ) : (
                        <div className="yt-ad-product-img-ph" />
                      )}
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="yt-ad-identity">
                  {iconSrc ? <img src={iconSrc} alt="" className="yt-ad-icon" /> : <div className="yt-ad-icon-ph" />}
                  <div>
                    <strong>{headline}</strong>
                    <div className="ads-preview-muted">{subtitle}</div>
                    {destinationHint ? (
                      <div className="ads-preview-muted yt-ad-dest">{destinationHint}</div>
                    ) : null}
                    {isAppInstall ? (
                      <div className="ads-preview-muted">Google Play · {appPriceLabel || "FREE"}</div>
                    ) : null}
                  </div>
                </div>
                {isAppInstall && (appRating || appDownloadCount || appCategory) ? (
                  <div className="ads-instream-stats">
                    {appRating ? (
                      <div>
                        <strong>{appRating} ★</strong>
                        {appReviewCount ? <div className="ads-stat-sub">{appReviewCount}</div> : null}
                      </div>
                    ) : null}
                    {appDownloadCount ? (
                      <div>
                        <strong>{appDownloadCount}</strong>
                        <div className="ads-stat-sub">Downloads</div>
                      </div>
                    ) : null}
                    {appCategory ? (
                      <div>
                        <strong>{appCategory}</strong>
                        <div className="ads-stat-sub">Category</div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <p className="ads-preview-muted yt-ad-desc">{description}</p>
              </>
            ) : (
              <div className="yt-ad-compact">
                {iconSrc ? <img src={iconSrc} alt="" className="yt-ad-icon yt-ad-icon--sm" /> : <div className="yt-ad-icon-ph yt-ad-icon--sm" />}
                <div className="yt-ad-compact-text">
                  <strong>{headline}</strong>
                  {destinationHint ? (
                    <div className="ads-preview-muted">{destinationHint}</div>
                  ) : (
                    <div className="ads-preview-muted">{subtitle}</div>
                  )}
                </div>
              </div>
            )}

            <div className="yt-ad-sheet-cta-wrap">
              {panelExpanded ? (
                <div className="ads-instream-actions">
                  <span className="ads-btn-learn">Learn more</span>
                  <span className="ads-btn-cta">{ctaLabel}</span>
                </div>
              ) : (
                <span className="ads-btn-cta ads-btn-cta--full">{ctaLabel}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="ads-preview-hint">
        Swipe panel ↑ for details · ↓ to collapse · Skip ad for finished state
        {videoShape === "portrait" ? " · Vertical video preview" : videoShape === "landscape" ? " · Wide video preview" : ""}
      </p>
    </div>
  );
}
