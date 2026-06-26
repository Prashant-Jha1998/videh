import { useState } from "react";

const LOGO_SRC = `${import.meta.env.BASE_URL}videh-logo.png`;

export function VidehRailLogo({ size = 40 }: { size?: number }) {
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
          background: "linear-gradient(135deg, #5B4FE8 0%, #008069 100%)",
          borderRadius: 10,
          color: "white",
          fontWeight: 800,
          fontSize: size * 0.42,
          fontFamily: "Segoe UI, sans-serif",
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
      style={{ width: size, height: size, objectFit: "contain", borderRadius: 8 }}
      onError={() => setImgFailed(true)}
    />
  );
}
