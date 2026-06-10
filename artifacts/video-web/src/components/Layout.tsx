import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { navigate } from "@/lib/router";
import { Sidebar } from "./Sidebar";

function useIsMobile(breakpoint = 900) {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return mobile;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const toggleMenu = () => {
    if (isMobile) setMobileOpen((v) => !v);
    else setCollapsed((v) => !v);
  };

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <div className={`yt-app${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " mobile-nav-open" : ""}`}>
      <header className="yt-header">
        <div className="yt-header-left">
          <button
            type="button"
            className="yt-icon-btn"
            aria-label="Guide"
            aria-expanded={isMobile ? mobileOpen : !collapsed}
            onClick={toggleMenu}
          >
            ☰
          </button>
          <a
            className="yt-brand"
            href="/"
            onClick={(e) => { e.preventDefault(); navigate("/"); }}
          >
            <img src="/videh_icon_foreground.png" alt="" width={28} height={28} />
            <span>Videh</span>
          </a>
        </div>
        <form className="yt-search" onSubmit={onSearch}>
          <div className="yt-search-box">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label="Search"
            />
            <button type="submit" className="yt-search-submit" aria-label="Search">
              🔍
            </button>
          </div>
          <button type="button" className="yt-icon-btn yt-mic" aria-label="Voice search">
            🎤
          </button>
        </form>
        <div className="yt-header-right">
          {user ? (
            <>
              <button type="button" className="yt-create-btn" onClick={() => navigate("/upload")}>
                <span>+</span> Create
              </button>
              <button type="button" className="yt-icon-btn" aria-label="Notifications">🔔</button>
              <button
                type="button"
                className="yt-avatar-btn"
                aria-label="Account"
                onClick={() => navigate("/studio")}
              >
                {(user.name?.[0] ?? user.phone?.slice(-1) ?? "V").toUpperCase()}
              </button>
            </>
          ) : (
            <button type="button" className="yt-signin-btn" onClick={() => navigate("/login")}>
              Sign in
            </button>
          )}
        </div>
      </header>
      {mobileOpen ? (
        <button
          type="button"
          className="yt-sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <div className="yt-body">
        <Sidebar
          open={isMobile ? mobileOpen : true}
          collapsed={!isMobile && collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
        <main className="yt-main">{children}</main>
      </div>
      {user ? (
        <button type="button" className="yt-signout-fab" onClick={logout} title="Log out">
          ⎋
        </button>
      ) : null}
    </div>
  );
}
