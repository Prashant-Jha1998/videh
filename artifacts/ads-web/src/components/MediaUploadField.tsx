import React, { useId, useRef } from "react";

type Props = {
  label: string;
  accept: string;
  hint?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  showUrlFallback?: boolean;
  previewType?: "image" | "video";
  previewSrc?: string;
};

export function MediaUploadField({
  label,
  accept,
  hint,
  file,
  onFileChange,
  urlValue = "",
  onUrlChange,
  showUrlFallback = true,
  previewType = "image",
  previewSrc,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label className="ads-upload-field">
      <span className="ads-upload-label">{label}</span>
      {hint ? <span className="ads-upload-hint">{hint}</span> : null}

      <div
        className={`ads-upload-zone${file ? " ads-upload-zone--has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("ads-upload-zone--drag");
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove("ads-upload-zone--drag");
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("ads-upload-zone--drag");
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onFileChange(dropped);
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="ads-upload-input"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="ads-upload-file">
            {previewSrc && previewType === "image" ? (
              <img src={previewSrc} alt="" className="ads-upload-thumb" />
            ) : previewSrc && previewType === "video" ? (
              <video src={previewSrc} className="ads-upload-thumb ads-upload-thumb--video" muted playsInline />
            ) : (
              <div className="ads-upload-thumb ads-upload-thumb--placeholder">📁</div>
            )}
            <div className="ads-upload-meta">
              <strong>{file.name}</strong>
              <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
            <button type="button" className="ads-upload-change" onClick={() => inputRef.current?.click()}>
              Change
            </button>
            <button
              type="button"
              className="ads-upload-remove"
              onClick={() => {
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="ads-upload-pick" onClick={() => inputRef.current?.click()}>
            <span className="ads-upload-pick-icon" aria-hidden="true">↑</span>
            <span>Upload {previewType === "video" ? "video" : "image"}</span>
            <span className="ads-upload-pick-sub">or drag and drop here</span>
          </button>
        )}
      </div>

      {showUrlFallback && onUrlChange ? (
        <details className="ads-upload-url-fallback">
          <summary>Or paste URL instead</summary>
          <input
            className="ads-upload-url-input"
            value={urlValue}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://..."
          />
        </details>
      ) : null}
    </label>
  );
}
