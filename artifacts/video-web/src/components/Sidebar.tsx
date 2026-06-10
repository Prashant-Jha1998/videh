import { navigate } from "@/lib/router";

type Item = { icon: string; label: string; path?: string; onClick?: () => void };

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

function NavItem({ item }: { item: Item }) {
  return (
    <button
      type="button"
      className="yt-nav-item"
      onClick={() => (item.path ? navigate(item.path) : item.onClick?.())}
    >
      <span className="yt-nav-icon" aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
}

export function Sidebar({ open }: { open: boolean }) {
  return (
    <aside className={`yt-sidebar${open ? " open" : ""}`} aria-label="Guide">
      <nav className="yt-nav-group">
        {MAIN.map((item) => <NavItem key={item.label} item={item} />)}
      </nav>
      <hr className="yt-nav-divider" />
      <p className="yt-nav-heading">You</p>
      <nav className="yt-nav-group">
        {YOU.map((item) => <NavItem key={item.label} item={item} />)}
      </nav>
      <hr className="yt-nav-divider" />
      <p className="yt-nav-heading">Explore</p>
      <nav className="yt-nav-group">
        {EXPLORE.map((item) => <NavItem key={item.label} item={item} />)}
      </nav>
      <hr className="yt-nav-divider" />
      <nav className="yt-nav-group">
        <a className="yt-nav-item yt-nav-link" href="https://videh.co.in/download.html" rel="noopener">
          <span className="yt-nav-icon" aria-hidden>📱</span>
          <span>Get Videh app</span>
        </a>
        <a className="yt-nav-item yt-nav-link" href="https://ads.videh.co.in/" rel="noopener">
          <span className="yt-nav-icon" aria-hidden>📣</span>
          <span>Videh Ads</span>
        </a>
      </nav>
    </aside>
  );
}
