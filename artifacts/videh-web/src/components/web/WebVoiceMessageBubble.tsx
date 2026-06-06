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

  const bars = useMemo(() => {
    const recorded = parseVoiceWaveform(content, VOICE_WAVE_BAR_COUNT);
    return recorded ?? fallbackVoiceWaveHeights(id + url.slice(-20), VOICE_WAVE_BAR_COUNT);
  }, [content, id, url]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(false);
    setPosition(0);
    releaseVoicePlayback(id);
  }, [id]);

  useEffect(() => subscribeVoicePlayback(id, stop), [id, stop]);

  useEffect(() => {
    if (!blobUrl) return;
    const audio = new Audio(blobUrl);
    audioRef.current = audio;

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

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, [blobUrl, id]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      releaseVoicePlayback(id);
      return;
    }
    claimVoicePlayback(id);
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      releaseVoicePlayback(id);
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const accent = isMe ? "#008069" : "#00a884";

  if (failed) {
    return <div className="vw-voice vw-voice--error">Voice message unavailable</div>;
  }
  if (loading || !blobUrl) {
    return <div className="vw-voice vw-voice--loading">Loading voice message…</div>;
  }

  return (
    <div className={`vw-voice${isMe ? " vw-voice--sent" : ""}`}>
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
        </div>
      </div>
    </div>
  );
}
