import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import { buildCallMediaConstraints, getCallMediaSettings } from "@/lib/callMediaSettings";

/** Local camera preview while outgoing video call is ringing (before WebRTC connects). */
export function useCallCameraPreview(enabled: boolean) {
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const [streamUrl, setStreamUrl] = useState<string | undefined>();
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!enabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStreamUrl(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (Platform.OS === "android") {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
        }
        const { lowDataMode } = await getCallMediaSettings();
        const constraints = buildCallMediaConstraints(true, lowDataMode, facingRef.current);
        let stream: MediaStream;
        if (Platform.OS === "web") {
          if (!navigator.mediaDevices?.getUserMedia) return;
          stream = await navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints);
        } else {
          const { mediaDevices } = require("react-native-webrtc");
          stream = await mediaDevices.getUserMedia(constraints);
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (Platform.OS === "web") {
          setStreamUrl("web-preview");
        } else {
          const url = typeof (stream as { toURL?: () => string }).toURL === "function"
            ? (stream as { toURL: () => string }).toURL()
            : undefined;
          setStreamUrl(url);
        }
      } catch {
        /* camera unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, generation]);

  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || !streamRef.current) return;
    const el = document.getElementById("videh-call-preview") as HTMLVideoElement | null;
    if (el && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.muted = true;
      void el.play().catch(() => {});
    }
  }, [enabled, streamUrl, generation]);

  const flipPreviewCamera = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0] as { _switchCamera?: () => void } | undefined;
    if (track?._switchCamera) {
      try {
        track._switchCamera();
        facingRef.current = facingRef.current === "user" ? "environment" : "user";
        return;
      } catch {
        /* fall through */
      }
    }
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    setGeneration((g) => g + 1);
  }, []);

  return { previewStreamUrl: streamUrl, flipPreviewCamera };
}
