import { useEffect } from "react";
import { Platform } from "react-native";

type Handlers = {
  onSend?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
};

/** WhatsApp Web–style shortcuts: Ctrl+Enter send, Ctrl+F search, Esc close panels. */
export function useWebKeyboardShortcuts(handlers: Handlers): void {
  const { onSend, onSearch, onEscape, enabled = true } = handlers;

  useEffect(() => {
    if (Platform.OS !== "web" || !enabled || typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        onSend?.();
        return;
      }
      if (mod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        onSearch?.();
        return;
      }
      if (e.key === "Escape") {
        onEscape?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onSend, onSearch, onEscape]);
}
