import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { buildCallMediaConstraints } from "@/lib/callMediaSettings";

/** Local camera preview while outgoing video call is ringing (before WebRTC connects). */
export function useOutgoingCallCameraPreview(active: boolean): string | undefined {
  const [streamUrl, setStreamUrl] = useState<string | undefined>();
  const streamRef = useRef<{ getTracks: () => { stop: () => void }[]; toURL?: () => string } | null>(null);

  useEffect(() => {
    if (!active) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStreamUrl(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (Platform.OS === "android") {
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ] as any);
          const denied = Object.values(results).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
          if (denied) return;
        }
        const { mediaDevices } = require("react-native-webrtc");
        const stream = await mediaDevices.getUserMedia(buildCallMediaConstraints(true, false, "user"));
        if (cancelled) {
          stream.getTracks?.().forEach((t: { stop: () => void }) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStreamUrl(typeof stream.toURL === "function" ? stream.toURL() : undefined);
      } catch {
        /* preview optional */
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active]);

  return streamUrl;
}
