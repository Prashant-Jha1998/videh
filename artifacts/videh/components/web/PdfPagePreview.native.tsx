import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import { buildPdfPreviewHtml } from "@/lib/pdfPreviewHtml";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { extensionFromFilename } from "@/lib/normalizeMessage";

type Props = {
  mediaUrl: string;
  filename: string;
  sessionToken?: string | null;
  height?: number;
  localUri?: string | null;
};

const MAX_READ_BYTES = 4_500_000;

export function PdfPagePreview({ mediaUrl, filename, sessionToken, height = 220, localUri }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const isPdf = extensionFromFilename(filename) === "pdf";

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setHtml(null);

    void (async () => {
      try {
        let b64 = "";
        const local = localUri?.trim();
        if (local) {
          const info = await FileSystem.getInfoAsync(local);
          const size = info.exists && "size" in info ? (info.size ?? 0) : 0;
          b64 = await FileSystem.readAsStringAsync(local, {
            encoding: FileSystem.EncodingType.Base64,
            length: Math.min(size || MAX_READ_BYTES, MAX_READ_BYTES),
          });
        } else {
          const url = resolvePublicAssetUrl(mediaUrl) ?? mediaUrl;
          if (url.startsWith("file:")) {
            b64 = await FileSystem.readAsStringAsync(url, {
              encoding: FileSystem.EncodingType.Base64,
              length: MAX_READ_BYTES,
            });
          } else if (/^https?:\/\//i.test(url)) {
            const res = await fetch(url, { headers: authFetchHeaders(sessionToken) });
            if (!res.ok) throw new Error("fetch failed");
            const buf = await res.arrayBuffer();
            const slice = buf.byteLength > MAX_READ_BYTES ? buf.slice(0, MAX_READ_BYTES) : buf;
            b64 = arrayBufferToBase64(slice);
          } else {
            throw new Error("unsupported uri");
          }
        }
        if (cancelled) return;
        setHtml(buildPdfPreviewHtml(b64, height));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isPdf, mediaUrl, filename, sessionToken, height, localUri]);

  const webSource = useMemo(() => (html ? { html } : undefined), [html]);

  if (!isPdf) return null;

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      {loading && !failed ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#8696A0" />
        </View>
      ) : null}
      {failed ? <View style={[styles.fallback, { height }]} pointerEvents="none" /> : null}
      {webSource ? (
        <WebView
          source={webSource}
          style={[styles.web, { height }]}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return Buffer.from(binary, "binary").toString("base64");
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  web: { width: "100%", backgroundColor: "#fff" },
  center: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  fallback: { backgroundColor: "#f0f2f5", width: "100%" },
});
