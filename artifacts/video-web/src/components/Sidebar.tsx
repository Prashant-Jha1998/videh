import { navigate } from "@/lib/router";

type Item = { icon: string; label: string; path?: string };

const MAIN: Item[] = [
  { icon: "⌂", label: "Home", path: "/" },
  { icon: "▶", label: "Shorts", path: "/search?q=shorts" },
  { icon: "☰", label: "Subscriptions", path: "/search?q=subscriptions" },
];

const YOU: Item[] = [
  { icon: "◎", label: "Your channel", path: "/studio" },
  { icon: "⬆", label: "Upload video", path: "/upload" },
  { icon: "✎", label: "Channel studio", path: "/studio" },
];

const EXPLORE: Item[] = [
  { icon: "♫", label: "Music", path: "/search?q=music" },
  { icon: "🎮", label: "Gaming", path: "/search?q=gaming" },
  { icon: "📰", label: "News", path: "/search?q=news" },
  { icon: "⚽", label: "Sports", path: "/search?q=sports" },
];

function NavItem({
  item,
  onNavigate,
}: {
  item: Item;
  onNavigate: () => void;
}) {
  return (
    <button
      type="button"
      className="yt-nav-item"
      title={item.label}
      onClick={() => {
        if (item.path) navigate(item.path);
        onNavigate();
      }}
    >
      <span className="yt-nav-icon" aria-hidden>{item.icon}</span>
      <span className="yt-nav-label">{item.label}</span>
    </button>
  );
}

export function Sidebar({
  open,
  collapsed,
  onNavigate,
}: {
  open: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <aside
      className={`yt-sidebar${open ? " open" : ""}${collapsed ? " collapsed" : ""}`}
      aria-label="Guide"
    >
      <nav className="yt-nav-group">
        {MAIN.map((item) => <NavItem key={item.label} item={item} onNavigate={onNavigate} />)}
      </nav>
      <hr className="yt-nav-divider" />
      <p className="yt-nav-heading">You</p>
      <nav className="yt-nav-group">
        {YOU.map((item) => <NavItem key={item.label} item={item} onNavigate={onNavigate} />)}
      </nav>
      <hr className="yt-nav-divider" />
      <p className="yt-nav-heading">Explore</p>
      <nav className="yt-nav-group">
        {EXPLORE.map((item) => <NavItem key={item.label} item={item} onNavigate={onNavigate} />)}
      </nav>
      <hr className="yt-nav-divider" />
      <nav className="yt-nav-group">
        <a className="yt-nav-item yt-nav-link" href="https://videh.co.in/download.html" rel="noopener">
          <span className="yt-nav-icon" aria-hidden>📱</span>
          <span className="yt-nav-label">Get Videh app</span>
        </a>
        <a className="yt-nav-item yt-nav-link" href="https://ads.videh.co.in/" rel="noopener">
          <span className="yt-nav-icon" aria-hidden>📣</span>
          <span className="yt-nav-label">Videh Ads</span>
        </a>
      </nav>
    </aside>
  );
}
