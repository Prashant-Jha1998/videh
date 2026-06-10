import React, { useEffect, useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { ChannelPage } from "@/pages/ChannelPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { SearchPage } from "@/pages/SearchPage";
import { StudioPage } from "@/pages/StudioPage";
import { UploadPage } from "@/pages/UploadPage";
import { WatchPage } from "@/pages/WatchPage";
import { parseRoute, type Route } from "@/lib/router";

function RouterView({ route }: { route: Route }) {
  switch (route.page) {
    case "login":
      return <LoginPage redirect={route.redirect} />;
    case "watch":
      return <WatchPage videoId={route.id} />;
    case "channel":
      return <ChannelPage handle={route.handle} />;
    case "upload":
      return <UploadPage />;
    case "studio":
      return <StudioPage />;
    case "search":
      return <SearchPage q={route.q} />;
    default:
      return <HomePage />;
  }
}

function AppInner() {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.pathname, window.location.search),
  );

  useEffect(() => {
    const onNav = () => setRoute(parseRoute(window.location.pathname, window.location.search));
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  const isLogin = route.page === "login";

  return isLogin ? (
    <RouterView route={route} />
  ) : (
    <Layout>
      <RouterView route={route} />
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
