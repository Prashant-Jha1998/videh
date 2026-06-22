import React, { useCallback, useEffect, useState } from "react";
import { VidehLogo } from "./VidehLogo";

export type AdsNav = "overview" | "campaigns" | "ads" | "billing";

const NAV_ITEMS: { id: AdsNav; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◉" },
  { id: "campaigns", label: "Campaigns", icon: "▣" },
  { id: "ads", label: "Ads & assets", icon: "▶" },
  { id: "billing", label: "Billing", icon: "₹" },
];

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
          <span className="ads-sidebar-tag">Advertiser portal</span>
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
            <span className="ads-nav-icon" aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <footer className="ads-sidebar-foot">
        <div className="ads-balance-pill" title="Wallet balance">
          <span className="ads-balance-label">Wallet</span>
          <strong>₹{balance.toLocaleString("en-IN")}</strong>
        </div>
        <button type="button" className="ads-signout-btn" onClick={onSignOut}>
          Sign out
        </button>
        <p className="ads-security-note">Secured session · videh.co.in</p>
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
              <p className="ads-topbar-sub">Run ads on Videh home feed and video player</p>
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
