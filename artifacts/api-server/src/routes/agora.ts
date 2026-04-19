import { Router, type Request, type Response } from "express";

const router = Router();

const APP_ID = process.env.AGORA_APP_ID ?? "";
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE ?? "";

router.get("/config", (_req: Request, res: Response) => {
  if (!APP_ID) {
    res.status(503).json({ success: false, message: "Agora not configured" });
    return;
  }
  res.json({ success: true, appId: APP_ID, tokenEnabled: !!APP_CERTIFICATE });
});

router.get("/token", async (req: Request, res: Response) => {
  const { channel, uid } = req.query as { channel?: string; uid?: string };
  if (!channel || !uid) {
    res.status(400).json({ success: false, message: "channel and uid required" });
    return;
  }
  if (!APP_ID) {
    res.status(503).json({ success: false, message: "Agora App ID not configured" });
    return;
  }
  if (!APP_CERTIFICATE) {
    res.json({ success: true, token: null, appId: APP_ID, channel, uid });
    return;
  }
  try {
    const { RtcTokenBuilder, RtcRole } = await import("agora-token");
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channel,
      Number(uid),
      RtcRole.PUBLISHER,
      expiry,
      expiry
    );
    res.json({ success: true, token, appId: APP_ID, channel, uid });
  } catch (err: any) {
    req.log?.error?.({ err }, "agora token error");
    res.status(500).json({ success: false, message: "Token generation failed" });
  }
});

export default router;
