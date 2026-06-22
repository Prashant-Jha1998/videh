import React, { useEffect, useRef, useState } from "react";
import { adsPortalConfig } from "../lib/adsClient";

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
  mode: "login" | "register";
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
        const d = await adsPortalConfig();
        if (cancelled) return;
        if (!d.googleSignInEnabled || !d.googleClientId) {
          setEnabled(false);
          setReady(true);
          return;
        }
        await loadGoogleIdentityScript();
        if (cancelled || !hostRef.current) return;
        const gsi = window.google?.accounts?.id;
        if (!gsi) {
          setLoadError("Google sign-in could not load.");
          setReady(true);
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
          text: mode === "register" ? "signup_with" : "signin_with",
          shape: "rectangular",
          width,
          logo_alignment: "left",
        });
        setEnabled(true);
        setReady(true);
      } catch {
        if (!cancelled) {
          setLoadError("Google sign-in is unavailable right now.");
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, onCredential]);

  if (loadError) {
    return <p style={{ fontSize: 12, color: "#b06000", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>{loadError}</p>;
  }

  if (!enabled && ready) return null;

  return (
    <div style={{ marginBottom: 12, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div ref={hostRef} style={{ display: "flex", justifyContent: "center", minHeight: 44, width: "100%" }} />
      {!ready && !loadError ? (
        <div style={{ height: 44, borderRadius: 8, border: "1px solid #dadce0", background: "#f8f9fa" }} />
      ) : null}
    </div>
  );
}
