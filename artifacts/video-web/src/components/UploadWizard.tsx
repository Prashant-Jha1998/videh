import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  addVideoToPlaylist,
  beginVideoUpload,
  createPlaylist,
  finalizeVideoUpload,
  type ReelsPlaylist,
  type ReelsVideo,
  type VideoUploadSession,
} from "@/lib/reelsApi";
import {
  blobToFile,
  captureVideoFrame,
  formatClock,
  readVideoAspect,
  readVideoDuration,
} from "@/lib/uploadMedia";
import { navigate } from "@/lib/router";

type StepId = "details" | "elements" | "checks" | "visibility";

const STEPS: { id: StepId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "elements", label: "Video elements" },
  { id: "checks", label: "Checks" },
  { id: "visibility", label: "Visibility" },
];

const CATEGORIES = [
  { value: "", label: "Select" },
  { value: "music", label: "Music" },
  { value: "gaming", label: "Gaming" },
  { value: "news", label: "News" },
  { value: "sports", label: "Sports" },
  { value: "comedy", label: "Comedy" },
  { value: "education", label: "Education" },
  { value: "tech", label: "Tech" },
  { value: "vlogs", label: "Vlogs" },
  { value: "people", label: "People & blogs" },
];

type UploadPhase = "uploading" | "uploaded" | "error";

export function UploadWizard({
  videoFile,
  playlists,
  onClose,
  onDone,
}: {
  videoFile: File;
  playlists: ReelsPlaylist[];
  onClose: () => void;
  onDone: (video: ReelsVideo) => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<StepId>("details");
  const [title, setTitle] = useState(videoFile.name.replace(/\.[^.]+$/, "").slice(0, 100));
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [category, setCategory] = useState("");
  const [madeForKids, setMadeForKids] = useState<"yes" | "no" | "">("");
  const [commentsOn, setCommentsOn] = useState(true);
  const [playlistId, setPlaylistId] = useState("");
  const [newPlaylist, setNewPlaylist] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [thumbChoice, setThumbChoice] = useState<"auto" | "custom">("auto");
  const [customThumb, setCustomThumb] = useState<File | null>(null);
  const [autoThumbUrl, setAutoThumbUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isShort, setIsShort] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("uploading");
  const [uploadPct, setUploadPct] = useState(0);
  const [checksDone, setChecksDone] = useState(false);
  const [session, setSession] = useState<VideoUploadSession | null>(null);
  const [published, setPublished] = useState<ReelsVideo | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const customThumbUrl = useMemo(
    () => (customThumb ? URL.createObjectURL(customThumb) : null),
    [customThumb],
  );
  useEffect(() => {
    return () => {
      if (customThumbUrl) URL.revokeObjectURL(customThumbUrl);
    };
  }, [customThumbUrl]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const titleInvalid = title.trim().length < 2;
  const audienceInvalid = madeForKids === "";
  const canNext = !titleInvalid && (step !== "details" || !audienceInvalid);

  const shareUrl = published
    ? `${window.location.origin}/watch/${published.id}`
    : null;

  const mergedHashtags = useMemo(() => {
    const parts = tags.split(/[,\s#]+/).map((t) => t.trim()).filter(Boolean);
    if (category) parts.push(category);
    return [...new Set(parts)].join(", ");
  }, [tags, category]);

  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    void (async () => {
      const [dur, aspect, frame] = await Promise.all([
        readVideoDuration(videoFile),
        readVideoAspect(videoFile),
        captureVideoFrame(videoFile, 1),
      ]);
      setDuration(dur);
      setIsShort(aspect.isShort);
      if (frame) {
        setAutoThumbUrl(URL.createObjectURL(frame));
      }
    })();
    return () => {
      setAutoThumbUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [videoFile]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setUploadPhase("uploading");
      setError("");
      const res = await beginVideoUpload({
        userId: user.dbId,
        token: user.sessionToken,
        videoFile,
        onProgress: setUploadPct,
      });
      if (cancelled) return;
      if (!res.success || !res.session) {
        setUploadPhase("error");
        setError(res.message ?? "Upload failed");
        return;
      }
      setSession(res.session);
      setUploadPhase("uploaded");
      setChecksDone(true);
    })();
    return () => { cancelled = true; };
  }, [user, videoFile]);

  const publish = async () => {
    if (!user || !session || publishing) return;
    setPublishing(true);
    setError("");
    try {
      let thumbForFinalize: File | undefined;
      if (thumbChoice === "custom" && customThumb) {
        thumbForFinalize = customThumb;
      } else if (thumbChoice === "auto" && autoThumbUrl) {
        thumbForFinalize = blobToFile(
          await (await fetch(autoThumbUrl)).blob(),
          `thumb_${Date.now()}.jpg`,
        );
      }

      const res = await finalizeVideoUpload({
        userId: user.dbId,
        token: user.sessionToken,
        title: title.trim(),
        description: description.trim(),
        hashtags: mergedHashtags,
        durationSeconds: duration,
        session,
        thumbnailFile: thumbForFinalize,
      });

      if (!res.success || !res.video) {
        setError(res.message ?? "Could not publish video");
        return;
      }

      const video = res.video;
      setPublished(video);

      if (playlistId) {
        await addVideoToPlaylist(user.dbId, Number(playlistId), video.id, user.sessionToken);
      } else if (newPlaylist.trim()) {
        await createPlaylist(user.dbId, newPlaylist.trim(), user.sessionToken, [video.id]);
      }

      onDone(video);
    } catch {
      setError("Publish failed. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1].id);
      return;
    }
    void publish();
  };

  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id);
  };

  const copyLink = () => {
    if (shareUrl) void navigator.clipboard.writeText(shareUrl);
  };

  const thumbPreview =
    thumbChoice === "custom" && customThumb
      ? URL.createObjectURL(customThumb)
      : autoThumbUrl;

  return (
    <div className="yt-upload-overlay" role="dialog" aria-modal="true" aria-label="Upload video">
      <header className="yt-upload-header">
        <nav className="yt-upload-stepper" aria-label="Upload progress">
          {STEPS.map((s, i) => {
            const active = s.id === step;
            const done = i < stepIndex || (s.id === "checks" && checksDone);
            const warn = s.id === "details" && (titleInvalid || audienceInvalid) && !active;
            return (
              <button
                key={s.id}
                type="button"
                className={`yt-upload-step${active ? " active" : ""}${done ? " done" : ""}${warn ? " warn" : ""}`}
                onClick={() => i <= stepIndex && setStep(s.id)}
              >
                <span className="yt-upload-step-icon" aria-hidden>
                  {warn ? "!" : done ? "✓" : i + 1}
                </span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="yt-upload-header-actions">
          {publishing ? <span className="yt-upload-saving">Saving…</span> : null}
          <button type="button" className="yt-upload-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>

      <div className="yt-upload-body">
        <div className="yt-upload-main">
          {step === "details" ? (
            <>
              <div className="yt-upload-section-head">
                <h2>Details</h2>
              </div>

              <label className={`yt-upload-field${titleInvalid ? " invalid" : ""}`}>
                <span className="yt-upload-label">
                  Title (required)
                  <span className="yt-upload-count">{title.length}/100</span>
                </span>
                <textarea
                  rows={2}
                  value={title}
                  maxLength={100}
                  placeholder="Add a title that describes your video"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="yt-upload-field">
                <span className="yt-upload-label">Description</span>
                <textarea
                  rows={4}
                  value={description}
                  placeholder="Tell viewers about your video"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <section className="yt-upload-block">
                <h3>Thumbnail</h3>
                {isShort ? (
                  <p className="yt-upload-info">
                    Shorts thumbnail — pick a frame or upload a custom image.
                  </p>
                ) : null}
                <div className="yt-upload-thumbs">
                  <button
                    type="button"
                    className={`yt-upload-thumb-slot${thumbChoice === "auto" ? " selected" : ""}`}
                    onClick={() => setThumbChoice("auto")}
                  >
                    {autoThumbUrl ? (
                      <img src={autoThumbUrl} alt="Auto frame" />
                    ) : (
                      <span>Auto</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`yt-upload-thumb-slot${thumbChoice === "custom" ? " selected" : ""}`}
                    onClick={() => thumbInputRef.current?.click()}
                  >
                    {customThumbUrl ? (
                      <img src={customThumbUrl} alt="Custom" />
                    ) : (
                      <span>Upload</span>
                    )}
                  </button>
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setCustomThumb(f);
                        setThumbChoice("custom");
                      }
                    }}
                  />
                </div>
              </section>

              <label className="yt-upload-field">
                <span className="yt-upload-label">Playlists</span>
                <select value={playlistId} onChange={(e) => setPlaylistId(e.target.value)}>
                  <option value="">Select</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
                <input
                  className="yt-upload-inline"
                  placeholder="Or create new playlist"
                  value={newPlaylist}
                  onChange={(e) => { setNewPlaylist(e.target.value); setPlaylistId(""); }}
                />
              </label>

              <section className="yt-upload-block">
                <h3>Audience</h3>
                <p className="yt-upload-info">
                  Is this video made for kids? (required for Videh policy compliance)
                </p>
                <label className="yt-upload-radio">
                  <input
                    type="radio"
                    name="kids"
                    checked={madeForKids === "yes"}
                    onChange={() => setMadeForKids("yes")}
                  />
                  Yes, it&apos;s made for kids
                </label>
                <label className="yt-upload-radio">
                  <input
                    type="radio"
                    name="kids"
                    checked={madeForKids === "no"}
                    onChange={() => setMadeForKids("no")}
                  />
                  No, it&apos;s not made for kids
                </label>
              </section>

              <label className="yt-upload-field">
                <span className="yt-upload-label">
                  Tags
                  <span className="yt-upload-count">{tags.length}/500</span>
                </span>
                <input
                  value={tags}
                  maxLength={500}
                  placeholder="Add tag"
                  onChange={(e) => setTags(e.target.value)}
                />
                <span className="yt-upload-hint">Enter a comma after each tag</span>
              </label>

              <label className="yt-upload-field">
                <span className="yt-upload-label">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value || "none"} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {step === "elements" ? (
            <>
              <div className="yt-upload-section-head">
                <h2>Video elements</h2>
              </div>
              <section className="yt-upload-block">
                <h3>Subtitles</h3>
                <p className="yt-upload-info">
                  Videh auto-generates captions after upload when speech is detected.
                  Edit captions later in Channel studio.
                </p>
              </section>
              <section className="yt-upload-block">
                <h3>End screen & cards</h3>
                <p className="yt-upload-info">
                  Add subscribe prompts and related videos from your channel page after publishing.
                </p>
              </section>
              {isShort ? (
                <section className="yt-upload-block">
                  <h3>Shorts remixing</h3>
                  <label className="yt-upload-check">
                    <input type="checkbox" defaultChecked />
                    Allow remixing on Videh Shorts
                  </label>
                </section>
              ) : null}
            </>
          ) : null}

          {step === "checks" ? (
            <>
              <div className="yt-upload-section-head">
                <h2>Checks</h2>
              </div>
              <section className="yt-upload-block">
                <h3>Copyright</h3>
                <p className="yt-upload-info">
                  {checksDone && uploadPhase === "uploaded"
                    ? "No copyright issues found."
                    : "Running copyright checks…"}
                </p>
              </section>
              <section className="yt-upload-block">
                <h3>Ad suitability</h3>
                <p className="yt-upload-info">
                  {checksDone
                    ? "Checks complete. No issues found."
                    : "Scanning content for policy compliance…"}
                </p>
              </section>
              <div className="yt-upload-progress-card">
                <p>
                  {uploadPhase === "uploading"
                    ? `Uploading… ${uploadPct}%`
                    : uploadPhase === "uploaded"
                      ? "Upload complete"
                      : "Upload failed"}
                </p>
                <div className="yt-upload-progress-bar">
                  <div style={{ width: `${uploadPct}%` }} />
                </div>
              </div>
            </>
          ) : null}

          {step === "visibility" ? (
            <>
              <div className="yt-upload-section-head">
                <h2>Visibility</h2>
              </div>
              <p className="yt-upload-info">
                Choose when to publish and who can see your video.
              </p>
              <div className="yt-upload-visibility-options">
                <label className={`yt-upload-vis-card${visibility === "public" ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="vis"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                  />
                  <strong>Public</strong>
                  <span>Everyone can watch after Videh safety review</span>
                </label>
                <label className={`yt-upload-vis-card disabled`}>
                  <input type="radio" name="vis" disabled />
                  <strong>Unlisted</strong>
                  <span>Coming soon — link-only sharing</span>
                </label>
                <label className={`yt-upload-vis-card disabled`}>
                  <input type="radio" name="vis" disabled />
                  <strong>Private</strong>
                  <span>Coming soon — only you can watch</span>
                </label>
              </div>
              <label className="yt-upload-check" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={commentsOn}
                  onChange={(e) => setCommentsOn(e.target.checked)}
                />
                Allow comments on this video
              </label>
              {published ? (
                <p className="success">Published! Visible on web and Videh app after review.</p>
              ) : null}
            </>
          ) : null}

          {error ? <p className="error yt-upload-error">{error}</p> : null}
        </div>

        <aside className="yt-upload-side">
          <div className={`yt-upload-preview${isShort ? " short" : ""}`}>
            {previewUrl ? (
              <video src={previewUrl} controls muted playsInline className="yt-upload-preview-vid" />
            ) : null}
          </div>
          {thumbPreview ? (
            <img src={thumbPreview} alt="" className="yt-upload-side-thumb" />
          ) : null}
          {shareUrl ? (
            <div className="yt-upload-side-link">
              <span>Video link</span>
              <div className="yt-upload-link-row">
                <a href={shareUrl}>{shareUrl}</a>
                <button type="button" onClick={copyLink} aria-label="Copy link">⧉</button>
              </div>
            </div>
          ) : null}
          <p className="yt-upload-filename">
            <span>Filename</span>
            {videoFile.name}
          </p>
          {duration > 0 ? (
            <p className="yt-upload-filename">
              <span>Duration</span>
              {formatClock(duration)}
            </p>
          ) : null}
        </aside>
      </div>

      <footer className="yt-upload-footer">
        <div className="yt-upload-footer-status">
          <span title="Upload">{uploadPhase === "uploaded" ? "✓" : "↑"}</span>
          <span title="Processing">SD</span>
          <span title="Checks">{checksDone ? "✓ Checks complete" : "… Checking"}</span>
        </div>
        <div className="yt-upload-footer-nav">
          {stepIndex > 0 ? (
            <button type="button" className="btn-ghost" onClick={goBack} disabled={publishing}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={
              published
                ? false
                : !canNext || publishing || uploadPhase !== "uploaded"
            }
            onClick={() => {
              if (published) {
                navigate(`/watch/${published.id}`);
                return;
              }
              goNext();
            }}
          >
            {step === "visibility"
              ? publishing
                ? "Publishing…"
                : published
                  ? "Done"
                  : "Publish"
              : "Next"}
          </button>
        </div>
      </footer>

    </div>
  );
}

export function UploadDropZone({
  onFile,
}: {
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const pick = (file: File | undefined) => {
    if (file && file.type.startsWith("video/")) onFile(file);
  };

  return (
    <div className="yt-upload-page">
      <header className="yt-upload-page-bar">
        <button type="button" className="yt-brand" onClick={() => navigate("/")}>
          <img src="/videh_icon_foreground.png" alt="" width={28} height={28} />
          <span>Videh</span>
        </button>
      </header>
      <div
        className={`yt-upload-drop${drag ? " drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        <div className="yt-upload-drop-icon" aria-hidden>⬆</div>
        <p>Drag and drop video files to upload</p>
        <p className="yt-upload-drop-sub">Your videos will be private until you publish them.</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => inputRef.current?.click()}
        >
          SELECT FILES
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <p className="yt-upload-legal">
        By submitting your videos to Videh, you agree to our Terms of Service and Community Guidelines.
        Make sure you don&apos;t violate others&apos; copyright or privacy rights.{" "}
        <a href="https://videh.co.in/privacy.html">Learn more</a>
      </p>
    </div>
  );
}
