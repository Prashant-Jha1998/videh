import { ChevronRight, Grid3x3, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { SettingsSectionId } from "../../lib/webSettingsTypes";
import { SETTINGS_ROWS } from "../../lib/webSettingsTypes";
import type { WebUser } from "../../lib/webApi";
import { WEB_LIST_PANE_WIDTH } from "../../lib/webDesktop";
import "./settings/webSettings.css";

export function WebSettingsPane({
  user,
  activeSection,
  onSectionSelect,
  onProfileClick,
  onLogout,
}: {
  user: WebUser;
  activeSection: SettingsSectionId | null;
  onSectionSelect: (id: SettingsSectionId) => void;
  onProfileClick: () => void;
  onLogout: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SETTINGS_ROWS;
    return SETTINGS_ROWS.filter((r) => r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="vs-root" style={{ width: WEB_LIST_PANE_WIDTH, flexShrink: 0 }}>
      <div className="vs-pane">
        <header className="vs-pane__header">
          <h2 className="vs-pane__title">Settings</h2>
          <button
            type="button"
            title="QR code"
            className={`vs-icon-btn${activeSection === "qr-code" ? " vs-icon-btn--active" : ""}`}
            onClick={() => onSectionSelect("qr-code")}
          >
            <Grid3x3 size={20} strokeWidth={1.75} />
          </button>
        </header>

        <div className="vs-search">
          <Search size={16} strokeWidth={2} color="#8696a0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings"
          />
        </div>

        <button type="button" className="vs-profile" onClick={onProfileClick}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="vs-profile__avatar" />
          ) : (
            <div className="vs-profile__avatar-fallback">{user.name.slice(0, 1).toUpperCase()}</div>
          )}
          <div>
            <div className="vs-profile__name">{user.name}</div>
            <div className="vs-profile__about">{user.about || "Hey there! I am using Videh."}</div>
          </div>
        </button>

        <div className="vs-nav-scroll">
          {filtered.length === 0 ? (
            <div className="vs-empty-nav">No settings match &ldquo;{search}&rdquo;</div>
          ) : (
            filtered.map((row) => {
              const active = activeSection === row.id;
              const Icon = row.Icon;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`vs-nav-row${active ? " vs-nav-row--active" : ""}`}
                  onClick={() => onSectionSelect(row.id)}
                >
                  <div
                    className="vs-nav-icon"
                    style={{ background: `linear-gradient(145deg, ${row.color} 0%, ${row.color}cc 100%)` }}
                  >
                    <Icon size={19} strokeWidth={2} />
                  </div>
                  <div className="vs-nav-label">
                    <div className="vs-nav-label__title">{row.label}</div>
                    <div className="vs-nav-label__sub">{row.sub}</div>
                  </div>
                  <ChevronRight className="vs-nav-chevron" size={18} strokeWidth={2} />
                </button>
              );
            })
          )}

          <button type="button" className="vs-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
