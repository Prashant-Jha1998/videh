import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/config", (_req: Request, res: Response) => {
  res.status(410).json({ success: false, message: "Legacy endpoint removed. Use /api/webrtc for Videh calls." });
});

router.get("/token", (_req, res) => {
  res.status(410).json({ success: false, message: "Legacy endpoint removed. Use /api/webrtc signaling." });
});

export default router;
