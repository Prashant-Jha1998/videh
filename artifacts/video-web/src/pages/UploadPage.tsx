import React, { useEffect, useState } from "react";
import { UploadDropZone, UploadWizard } from "@/components/UploadWizard";
import { useAuth } from "@/context/AuthContext";
import { fetchMyChannel, type ReelsPlaylist, type ReelsVideo } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function UploadPage() {
  const { user } = useAuth();
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const [playlists, setPlaylists] = useState<ReelsPlaylist[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent("/upload")}`);
      return;
    }
    void fetchMyChannel(user.dbId, user.sessionToken).then((res) => {
      setHasChannel(Boolean(res.channel));
      setPlaylists(res.playlists ?? []);
      if (!res.channel) navigate("/studio");
    });
  }, [user]);

  const onPublished = (video: ReelsVideo) => {
    setTimeout(() => navigate(`/watch/${video.id}`), 800);
  };

  if (!user || hasChannel === null) {
    return <p className="center-msg">Loading…</p>;
  }

  if (videoFile) {
    return (
      <UploadWizard
        videoFile={videoFile}
        playlists={playlists}
        onClose={() => setVideoFile(null)}
        onDone={onPublished}
      />
    );
  }

  return <UploadDropZone onFile={setVideoFile} />;
}
