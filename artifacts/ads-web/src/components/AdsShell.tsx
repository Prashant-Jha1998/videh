import React, { useCallback, useEffect, useState } from "react";
import { VidehLogo } from "./VidehLogo";

export type AdsNav = "overview" | "campaigns" | "ads" | "billing";

const NAV_ITEMS: { id: AdsNav; label: string; icon: AdsNav }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "campaigns", label: "Campaigns", icon: "campaigns" },
  { id: "ads", label: "Ads & assets", icon: "ads" },
  { id: "billing", label: "Billing", icon: "billing" },
];

const NAV_SUBTITLES: Record<AdsNav, string> = {
  overview: "Performance summary and live campaigns",
  campaigns: "Objectives, budgets, and schedules",
  ads: "Creatives, formats, and moderation status",
  billing: "Wallet, payments, and rate card",
};

function NavIcon({ name }: { name: AdsNav }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "overview":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "campaigns":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 6h16M4 12h10M4 18h14" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="19" cy="18" r="2" />
        </svg>
      );
    case "ads":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M10 9l6 3-6 3V9z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "billing":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h4" />
        </svg>
      );
    default:
      return null;
  }
}

type Props = {
  nav: AdsNav;
  onNav: (id: AdsNav) => void;
  companyName: string;
  balance: number;
  onSignOut: () => void;
  children: React.ReactNode;
};

export function AdsShell({ nav, onNav, companyName, balance, onSignOut, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen, closeMenu]);

  const pickNav = (id: AdsNav) => {
    onNav(id);
    closeMenu();
  };

  const sidebar = (
    <div className="ads-sidebar-inner">
      <div className="ads-sidebar-brand">
        <VidehLogo size={36} />
        <div>
          <strong className="ads-sidebar-title">Videh Ads</strong>
          <span className="ads-sidebar-tag">Advertiser console</span>
        </div>
      </div>

      <nav className="ads-sidebar-nav" aria-label="Dashboard">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={nav === item.id ? "ads-nav-btn ads-nav-btn--on" : "ads-nav-btn"}
            onClick={() => pickNav(item.id)}
          >
            <span className="ads-nav-icon" aria-hidden="true">
              <NavIcon name={item.icon} />
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <footer className="ads-sidebar-foot">
        <div className="ads-balance-pill" title="Wallet balance">
          <span className="ads-balance-label">Available balance</span>
          <strong>₹{balance.toLocaleString("en-IN")}</strong>
        </div>
        <button type="button" className="ads-signout-btn" onClick={onSignOut}>
          Sign out
        </button>
        <p className="ads-security-note">Encrypted session · ads.videh.co.in</p>
      </footer>
    </div>
  );

  return (
    <div className="ads-app">
      {menuOpen ? (
        <button
          type="button"
          className="ads-backdrop"
          aria-label="Close menu"
          onClick={closeMenu}
        />
      ) : null}

      <aside className={`ads-sidebar${menuOpen ? " ads-sidebar--open" : ""}`} aria-label="Sidebar">
        {sidebar}
      </aside>

      <div className="ads-main-col">
        <header className="ads-topbar">
          <div className="ads-topbar-left">
            <button
              type="button"
              className="ads-menu-btn"
              aria-expanded={menuOpen}
              aria-controls="ads-sidebar"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="ads-menu-icon" aria-hidden="true" />
            </button>
            <div>
              <h1 className="ads-topbar-title">{companyName}</h1>
              <p className="ads-topbar-sub">{NAV_SUBTITLES[nav]}</p>
            </div>
          </div>
          <div className="ads-topbar-actions">
            <span className="ads-topbar-balance">₹{balance.toLocaleString("en-IN")}</span>
            <button type="button" className="ads-signout-btn ads-signout-btn--compact" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="ads-main">{children}</main>
      </div>
    </div>
  );
}
