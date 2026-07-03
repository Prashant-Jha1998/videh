import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { useAuthenticatedMediaUrl } from "../../lib/authenticatedMedia";
import {
  VOICE_WAVE_BAR_COUNT,
  fallbackVoiceWaveHeights,
  formatVoiceDuration,
  parseVoiceDurationSec,
  parseVoiceWaveform,
} from "../../lib/webVoiceWaveform";
import { claimVoicePlayback, releaseVoicePlayback, subscribeVoicePlayback } from "../../lib/voicePlaybackHub";

export function WebVoiceMessageBubble({
  url,
  token,
  messageId,
  content,
  isMe,
}: {
  url: string;
  token: string | null;
  messageId: number;
  content: string;
  isMe: boolean;
}) {
  const id = String(messageId);
  const { blobUrl, loading, failed } = useAuthenticatedMediaUrl(url, token);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(Math.max(1, parseVoiceDurationSec(content)));
  const [position, setPosition] = useState(0);
  const [playError, setPlayError] = useState(false);

  const bars = useMemo(() => {
    const recorded = parseVoiceWaveform(content, VOICE_WAVE_BAR_COUNT);
    return recorded ?? fallbackVoiceWaveHeights(id + url.slice(-20), VOICE_WAVE_BAR_COUNT);
  }, [content, id, url]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setPosition(0);
    releaseVoicePlayback(id);
  }, [id]);

  useEffect(() => subscribeVoicePlayback(id, stop), [id, stop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !blobUrl) return;

    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
      releaseVoicePlayback(id);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [blobUrl, id]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || failed || !blobUrl) return;
    setPlayError(false);
    if (playing) {
      audio.pause();
      setPlaying(false);
      releaseVoicePlayback(id);
      return;
    }
    claimVoicePlayback(id);
    try {
      audio.currentTime = position > 0 && position < duration ? position : 0;
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setPlayError(true);
      releaseVoicePlayback(id);
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const accent = isMe ? "#059669" : "#059669";

  if (failed) {
    return <div className="vw-voice vw-voice--error">Voice message unavailable</div>;
  }
  if (loading || !blobUrl) {
    return <div className="vw-voice vw-voice--loading">Loading voice message…</div>;
  }

  return (
    <div className={`vw-voice${isMe ? " vw-voice--sent" : ""}`}>
      <audio ref={audioRef} src={blobUrl} preload="metadata" playsInline />
      <button type="button" className="vw-voice__play" onClick={() => void toggle()} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      <div className="vw-voice__body">
        <div className="vw-voice__wave" role="presentation">
          {bars.map((h, i) => {
            const filled = i / bars.length <= progress;
            return (
              <span
                key={i}
                className="vw-voice__bar"
                style={{
                  height: `${Math.round(8 + h * 22)}px`,
                  backgroundColor: filled ? accent : `${accent}44`,
                }}
              />
            );
          })}
        </div>
        <div className="vw-voice__meta">
          <Mic size={12} />
          <span>{playing ? formatVoiceDuration(position) : formatVoiceDuration(duration)}</span>
          {playError ? <span className="vw-voice__err">Tap to retry</span> : null}
        </div>
      </div>
    </div>
  );
}
