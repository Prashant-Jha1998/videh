import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { navigate } from "@/lib/router";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [q, setQ] = useState("");

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <div className="app-shell">
      <header className="top">
        <div className="top-inner">
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
            <img src="/videh_icon_foreground.png" alt="" width={32} height={32} />
            <span>Videh Video</span>
          </a>
          <form className="search" onSubmit={onSearch}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search videos and channels"
              aria-label="Search"
            />
            <button type="submit">Search</button>
          </form>
          <nav className="actions">
            {user ? (
              <>
                <button type="button" className="btn-upload" onClick={() => navigate("/upload")}>
                  + Upload
                </button>
                <button type="button" className="btn-ghost" onClick={() => navigate("/studio")}>
                  Studio
                </button>
                <button type="button" className="btn-ghost" onClick={logout}>
                  Log out
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={() => navigate("/login")}>
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="foot">
        <p>
          Same account as the Videh app — upload here, watch on phone, or vice versa.
          {" "}
          <a href="https://videh.co.in/download.html" rel="noopener">Get the app</a>
        </p>
      </footer>
    </div>
  );
}
