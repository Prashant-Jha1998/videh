import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchMyChannel, uploadVideo } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.max(1, Math.floor(v.duration || 0)));
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}

export function UploadPage() {
  const { user } = useAuth();
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent("/upload")}`);
      return;
    }
    fetchMyChannel(user.dbId, user.sessionToken).then((res) => {
      setHasChannel(Boolean(res.channel));
      if (!res.channel) navigate("/studio");
    });
  }, [user]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !videoFile || !title.trim()) {
      setError("Title and video file are required.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const duration = await readVideoDuration(videoFile);
      const res = await uploadVideo({
        userId: user.dbId,
        token: user.sessionToken,
        title: title.trim(),
        description: description.trim(),
        hashtags,
        durationSeconds: duration,
        videoFile,
        thumbnailFile: thumbFile ?? undefined,
        onProgress: setProgress,
      });
      if (!res.success || !res.video) {
        setError(res.message ?? "Upload failed");
        return;
      }
      setSuccess(res.pending ? "Uploaded — processing moderation…" : "Published! Visible on web and in the Videh app.");
      setTimeout(() => navigate(`/watch/${res.video!.id}`), 1200);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!user || hasChannel === null) return <p className="center-msg">Loading…</p>;

  return (
    <div className="page-form">
      <h1>Upload video</h1>
      <p className="hint">Videos uploaded here appear in the Videh app instantly after processing.</p>
      <form onSubmit={onSubmit}>
        <label>
          Video file
          <input
            type="file"
            accept="video/*"
            required
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Thumbnail (optional)
          <input type="file" accept="image/*" onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </label>
        <label>
          Hashtags (comma separated)
          <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="india, vlog, tech" />
        </label>
        {loading ? (
          <div className="progress">
            <div className="bar" style={{ width: `${progress}%` }} />
            <span>{progress}%</span>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Uploading…" : "Publish"}
        </button>
      </form>
    </div>
  );
}
