import type { Request } from "express";

export function publicMediaUrl(req: Request, relPath: string): string {
  const cdnBase = (process.env["MEDIA_PUBLIC_BASE_URL"] || process.env["CDN_BASE_URL"] || "").replace(/\/+$/, "");
  if (cdnBase) return `${cdnBase}${relPath}`;

  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
  return `${proto}://${req.get("host")}${relPath}`;
}
