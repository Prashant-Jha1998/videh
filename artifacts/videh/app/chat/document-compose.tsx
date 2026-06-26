import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PdfPagePreview } from "@/components/web/PdfPagePreview";
import { useApp } from "@/context/AppContext";
import { estimatePdfPageCount } from "@/lib/pdfPageCount";
import { getDocumentVisual, richDocumentMetaLine } from "@/lib/documentMessage";
import { extensionFromFilename } from "@/lib/normalizeMessage";

export default function DocumentComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sendDocumentMessage } = useApp();
  const params = useLocalSearchParams<{
    chatId?: string;
    uri?: string;
    name?: string;
    size?: string;
    mime?: string;
  }>();

  const chatId = String(params.chatId ?? "");
  const uri = params.uri ? decodeURIComponent(String(params.uri)) : "";
  const filename = params.name ? decodeURIComponent(String(params.name)) : "Document";
  const fileSizeBytes = Number(params.size ?? 0);
  const mime = params.mime ? decodeURIComponent(String(params.mime)) : "application/octet-stream";

  const [caption, setCaption] = useState("");
  const [pageCount, setPageCount] = useState<number | undefined>();
  const [loadingMeta, setLoadingMeta] = useState(false);

  const isPdf = extensionFromFilename(filename) === "pdf";
  const visual = useMemo(() => getDocumentVisual(filename), [filename]);

  useEffect(() => {
    if (!isPdf || !uri) return;
    let cancelled = false;
    setLoadingMeta(true);
    void estimatePdfPageCount(uri).then((n) => {
      if (!cancelled) {
        setPageCount(n);
        setLoadingMeta(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingMeta(false);
    });
    return () => { cancelled = true; };
  }, [isPdf, uri]);

  function onSend() {
    if (!chatId || !uri) return;
    sendDocumentMessage(chatId, uri, filename, fileSizeBytes, mime, {
      caption: caption.trim() || undefined,
      pageCount,
    });
    router.back();
  }

  if (!uri || !chatId) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Invalid document</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const metaLine = richDocumentMetaLine(filename, fileSizeBytes, pageCount);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={26} color="#E9EDEF" />
        </TouchableOpacity>
        <Text style={styles.fileTitle} numberOfLines={2}>{filename}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.previewWrap}>
        {isPdf ? (
          <PdfPagePreview
            mediaUrl={uri}
            filename={filename}
            localUri={uri}
            height={Platform.OS === "web" ? 420 : 380}
          />
        ) : (
          <View style={styles.docFallback}>
            <View style={[styles.docIconBox, { backgroundColor: visual.iconBg }]}>
              <Ionicons name={visual.icon} size={56} color={visual.iconColor} />
            </View>
            <Text style={styles.docFallbackName} numberOfLines={3}>{filename}</Text>
            <Text style={styles.docFallbackMeta}>{metaLine}</Text>
          </View>
        )}
        {loadingMeta ? <ActivityIndicator color="#5B4FE8" style={{ marginTop: 12 }} /> : null}
      </View>

      <TextInput
        style={styles.caption}
        placeholder="Add a caption…"
        placeholderTextColor="#8696a0"
        value={caption}
        onChangeText={setCaption}
        multiline
      />

      <TouchableOpacity style={[styles.sendFab, { bottom: insets.bottom + 20 }]} onPress={onSend} activeOpacity={0.88}>
        <Ionicons name="send" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12101F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#12101F" },
  err: { color: "#fff", marginBottom: 12 },
  link: { color: "#5B4FE8", fontWeight: "600" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  fileTitle: {
    flex: 1,
    color: "#E9EDEF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  previewWrap: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#14131F",
    alignItems: "center",
    justifyContent: "center",
  },
  docFallback: { alignItems: "center", padding: 24, gap: 12 },
  docIconBox: {
    width: 96,
    height: 96,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  docFallbackName: { color: "#E9EDEF", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  docFallbackMeta: { color: "#8696a0", fontSize: 13 },
  caption: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 24,
    backgroundColor: "#202c33",
    color: "#fff",
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 16,
    maxHeight: 100,
  },
  sendFab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#5B4FE8",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
