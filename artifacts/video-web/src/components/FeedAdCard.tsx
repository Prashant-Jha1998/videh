import React, { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  normalizeUrl,
  recordReelsAdClick,
  recordReelsAdImpression,
  type ReelsFeedAd,
} from "@/lib/reelsApi";

function adMediaUrl(ad: ReelsFeedAd): string | null {
  return normalizeUrl(ad.imageUrl) ?? normalizeUrl(ad.videoUrl);
}

function ctaPrimary(ad: ReelsFeedAd): string {
  if (ad.format === "app_install") return "Install";
  if (ad.videoUrl) return "Watch";
  return "Visit site";
}

export function FeedAdCard({ ad }: { ad: ReelsFeedAd }) {
  const { user } = useAuth();
  const impressed = useRef(false);
  const hero = adMediaUrl(ad);
  const brand = ad.appName ?? ad.headline ?? ad.title;
  const desc = ad.description?.trim() || ad.advertiserName;

  useEffect(() => {
    if (impressed.current || !user?.dbId || ad.id <= 0) return;
    impressed.current = true;
    void recordReelsAdImpression(
      {
        creativeId: ad.id,
        contentVideoId: 0,
        userId: user.dbId,
        placement: "feed_instream",
        watchedSeconds: 0,
        skipped: false,
        completed: false,
      },
      user.sessionToken,
    );
  }, [ad.id, user?.dbId, user?.sessionToken]);

  const trackClick = async (target: "cta" | "destination", url?: string | null) => {
    if (user?.dbId && ad.id > 0) {
      await recordReelsAdClick(
        { creativeId: ad.id, userId: user.dbId, placement: "feed_instream", clickTarget: target },
        user.sessionToken,
      );
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const onWatch = () => {
    const url = ad.videoUrl ? normalizeUrl(ad.videoUrl) : ad.destinationUrl;
    void trackClick("cta", url);
  };

  const onVisit = () => {
    const url = ad.destinationUrl ?? ad.playStoreUrl ?? ad.appStoreUrl;
    void trackClick("destination", url);
  };

  return (
    <article className="yt-ad-card">
      <div className="yt-ad-hero" onClick={onWatch} role="button" tabIndex={0}>
        {hero ? (
          <img src={hero} alt="" loading="lazy" />
        ) : (
          <div className="yt-ad-hero-fallback">Sponsored</div>
        )}
        <span className="yt-ad-badge">{ad.sponsoredLabel || "Sponsored"}</span>
      </div>
      <div className="yt-ad-body">
        <div className="yt-ad-brand-row">
          {hero ? (
            <img src={hero} alt="" className="yt-ad-logo" />
          ) : (
            <span className="yt-ad-logo-fallback">{brand[0]?.toUpperCase() ?? "A"}</span>
          )}
          <div className="yt-ad-copy">
            <h3>{brand}</h3>
            <p>{desc}</p>
            <span className="yt-ad-meta">{ad.advertiserName}</span>
          </div>
          <button type="button" className="yt-card-menu" aria-label="Ad options">⋮</button>
        </div>
        <div className="yt-ad-actions">
          {ad.videoUrl ? (
            <button type="button" className="yt-ad-btn" onClick={onWatch}>Watch</button>
          ) : null}
          <button type="button" className="yt-ad-btn yt-ad-btn-primary" onClick={onVisit}>
            {ctaPrimary(ad)}
          </button>
        </div>
      </div>
    </article>
  );
}
