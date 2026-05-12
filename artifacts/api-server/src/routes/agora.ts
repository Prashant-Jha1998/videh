import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/config", (_req: Request, res: Response) => {
  res.status(410).json({ success: false, message: "Agora calling has been removed. Use /api/webrtc for self-hosted Videh calls." });
});

router.get("/token", (_req, res) => {
  res.status(410).json({ success: false, message: "Agora tokens are disabled. Use /api/webrtc signaling." });
});

export default router;
