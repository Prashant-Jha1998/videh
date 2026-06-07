import { useState } from "react";

const LOGO_SRC = `${import.meta.env.BASE_URL}videh-logo.png`;

export function VidehLogo({ size = 36 }: { size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #00a884 0%, #008069 100%)",
          borderRadius: 8,
          color: "white",
          fontWeight: 700,
          fontSize: size * 0.42,
          flexShrink: 0,
        }}
        title="Videh"
      >
        V
      </div>
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="Videh"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", borderRadius: 8, flexShrink: 0 }}
      onError={() => setImgFailed(true)}
    />
  );
}
