import { useEffect, useRef, useState } from "react";
import { devFetch } from "../lib/devFetch";

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      logo_alignment?: "left" | "center";
    },
  ) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let gsiScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-videh-gsi="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.videhGsi = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script failed"));
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

type Props = {
  mode: "login" | "signup";
  disabled?: boolean;
  onCredential: (credential: string) => void | Promise<void>;
};

export function GoogleSignInButton({ mode, disabled, onCredential }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await devFetch("/api/developer-auth/config");
        const d = (await r.json()) as { googleSignInEnabled?: boolean; googleClientId?: string };
        if (cancelled) return;
        if (!r.ok || !d.googleSignInEnabled || !d.googleClientId) {
          setEnabled(false);
          return;
        }
        await loadGoogleIdentityScript();
        if (cancelled || !hostRef.current) return;
        const gsi = window.google?.accounts?.id;
        if (!gsi) {
          setLoadError("Google sign-in could not load.");
          return;
        }
        gsi.initialize({
          client_id: d.googleClientId,
          callback: (response) => {
            const credential = response.credential?.trim();
            if (credential) void onCredential(credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        hostRef.current.innerHTML = "";
        const width = Math.min(400, Math.max(280, hostRef.current.offsetWidth || 320));
        gsi.renderButton(hostRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: mode === "signup" ? "signup_with" : "signin_with",
          shape: "rectangular",
          width,
          logo_alignment: "left",
        });
        setEnabled(true);
        setReady(true);
      } catch {
        if (!cancelled) setLoadError("Google sign-in is unavailable right now.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, onCredential]);

  if (loadError) {
    return <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{loadError}</p>;
  }

  if (!enabled && ready) return null;

  return (
    <div className={disabled ? "opacity-60 pointer-events-none" : ""}>
      <div ref={hostRef} className="flex justify-center min-h-[44px] w-full google-signin-host" />
      {!ready && enabled === false && loadError === "" ? (
        <div className="h-11 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
      ) : null}
    </div>
  );
}
