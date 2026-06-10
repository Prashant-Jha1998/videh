import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  checkHandle,
  createChannel,
  deleteVideo,
  fetchChannel,
  fetchMyChannel,
  updateChannelProfile,
  type ReelsChannel,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;

export function StudioPage() {
  const { user } = useAuth();
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [mode, setMode] = useState<"create" | "manage">("manage");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent("/studio")}`);
      return;
    }
    fetchMyChannel(user.dbId, user.sessionToken).then(async (res) => {
      if (!res.channel) {
        setMode("create");
        return;
      }
      setChannel(res.channel);
      setDisplayName(res.channel.displayName ?? "");
      setBio(res.channel.bio ?? "");
      const pub = await fetchChannel(res.channel.handle, user.dbId, user.sessionToken);
      setVideos(pub.videos ?? []);
    });
  }, [user]);

  const create = async () => {
    if (!user) return;
    const h = handle.replace(/^@/, "").trim();
    if (!HANDLE_RE.test(h)) {
      setErr("Username: 3–30 chars, letters, numbers, underscore; must start with a letter.");
      return;
    }
    setLoading(true);
    setErr("");
    const avail = await checkHandle(h, user.sessionToken);
    if (!avail.available) {
      setErr(avail.message ?? "Username not available");
      setLoading(false);
      return;
    }
    const res = await createChannel(user.dbId, h, bio, user.sessionToken);
    setLoading(false);
    if (!res.success || !res.channel) {
      setErr(res.message ?? "Could not create channel");
      return;
    }
    setChannel(res.channel);
    setMode("manage");
    setMsg("Channel created! Upload your first video.");
  };

  const saveProfile = async () => {
    if (!user || !channel) return;
    setLoading(true);
    setErr("");
    const res = await updateChannelProfile(user.dbId, user.sessionToken, {
      displayName,
      bio,
      avatar: avatar ?? undefined,
      cover: cover ?? undefined,
    });
    setLoading(false);
    if (!res.success || !res.channel) {
      setErr(res.message ?? "Update failed");
      return;
    }
    setChannel(res.channel);
    setMsg("Profile updated.");
  };

  const removeVideo = async (id: number) => {
    if (!user || !confirm("Delete this video permanently?")) return;
    const res = await deleteVideo(id, user.dbId, user.sessionToken);
    if (res.success) setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  if (!user) return null;

  if (mode === "create") {
    return (
      <div className="page-form">
        <h1>Create your channel</h1>
        <p className="hint">One channel per Videh account. Same videos sync to the mobile app.</p>
        <label>
          @username (permanent)
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="mychannel" />
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </label>
        {err ? <p className="error">{err}</p> : null}
        <button type="button" className="btn-primary" disabled={loading} onClick={create}>
          Create channel
        </button>
      </div>
    );
  }

  if (!channel) return <p className="center-msg">Loading studio…</p>;

  return (
    <div className="page-studio">
      <h1>Channel studio — @{channel.handle}</h1>
      {msg ? <p className="success">{msg}</p> : null}
      <section className="studio-card">
        <h2>Profile</h2>
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        </label>
        <label>
          Avatar
          <input type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Cover image
          <input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        </label>
        {err ? <p className="error">{err}</p> : null}
        <button type="button" className="btn-primary" disabled={loading} onClick={saveProfile}>
          Save profile
        </button>
        <button type="button" className="btn-ghost" onClick={() => navigate(`/@${channel.handle}`)}>
          View public channel
        </button>
      </section>
      <section className="studio-card">
        <div className="row-between">
          <h2>Your videos ({videos.length})</h2>
          <button type="button" className="btn-primary" onClick={() => navigate("/upload")}>
            + Upload
          </button>
        </div>
        <ul className="studio-videos">
          {videos.map((v) => (
            <li key={v.id}>
              <button type="button" className="link-btn" onClick={() => navigate(`/watch/${v.id}`)}>
                {v.title}
              </button>
              <span>{v.viewCount} views</span>
              <button type="button" className="danger" onClick={() => removeVideo(v.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
