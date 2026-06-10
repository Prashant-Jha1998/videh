export type Route =
  | { page: "home" }
  | { page: "watch"; id: number }
  | { page: "channel"; handle: string }
  | { page: "upload" }
  | { page: "studio" }
  | { page: "login"; redirect?: string }
  | { page: "search"; q: string };

export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search);
  if (pathname === "/login") {
    return { page: "login", redirect: params.get("redirect") ?? undefined };
  }
  if (pathname === "/upload") return { page: "upload" };
  if (pathname === "/studio") return { page: "studio" };
  if (pathname === "/search") return { page: "search", q: params.get("q") ?? "" };

  const watch = pathname.match(/^\/watch\/(\d+)$/);
  if (watch) return { page: "watch", id: Number(watch[1]) };

  const channel = pathname.match(/^\/(?:@|channel\/)([a-zA-Z][a-zA-Z0-9_]{2,29})$/);
  if (channel) return { page: "channel", handle: channel[1] };

  return { page: "home" };
}

export function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
