import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { extensionFromFilename } from "@/lib/normalizeMessage";

type Props = {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  height?: number;
  localUri?: string | null;
};

/** WhatsApp-style first-page PDF strip above document bubble (web only). */
export function PdfPagePreview({ mediaUrl, filename, sessionToken, height = 200 }: Props) {
  const hostRef = useRef<View>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (extensionFromFilename(filename) !== "pdf") return;
    let revoked: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const url = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
        const res = await fetch(url, { headers: authFetchHeaders(sessionToken) });
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        if (cancelled) return;

        const node = hostRef.current as unknown as HTMLElement | null;
        if (!node) return;
        const el = node as HTMLElement;
        el.innerHTML = "";
        const iframe = document.createElement("iframe");
        iframe.src = `${revoked}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
        iframe.title = filename;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.style.display = "block";
        iframe.style.background = "#ffffff";
        el.appendChild(iframe);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const node = hostRef.current as unknown as HTMLElement | null;
      if (node) (node as HTMLElement).innerHTML = "";
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [mediaUrl, filename, sessionToken]);

  if (extensionFromFilename(filename) !== "pdf") return null;

  return (
    <View style={[styles.wrap, { height }]}>
      {loading && !failed ? (
        <View style={styles.center}>
          <ActivityIndicator color="#8696A0" />
        </View>
      ) : null}
      {failed ? <View style={[styles.fallback, { height }]} /> : null}
      {/* @ts-expect-error web host for iframe */}
      <View ref={hostRef} style={[styles.host, { height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  host: { width: "100%", overflow: "hidden" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  fallback: { backgroundColor: "#f5f5f5", width: "100%" },
});
