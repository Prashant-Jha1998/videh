import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { passwordChecks, validateDeveloperPassword } from "../lib/developerPasswordPolicy";
import {
  clearDeveloperPortalCookie,
  developerPortalSessionConfigured,
  getDeveloperPortalUser,
  issueDeveloperPortalToken,
  setDeveloperPortalCookie,
} from "../lib/developerPortalSession";
import {
  createPortalUser,
  findPortalUserByEmail,
  getActiveLeadForPortalUser,
  normalizePortalEmail,
  updatePortalUserPassword,
  verifyPortalUserPassword,
} from "../lib/developerPortalUsers";
import { stateDelete, stateGetJson, stateSetJson } from "../lib/sharedState";

const router = Router();
const RESET_OTP_TTL_MS = 15 * 60 * 1000;
const resetKey = (email: string) => `dev-portal-reset:${normalizePortalEmail(email)}`;

router.get("/password-rules", (_req, res) => {
  res.json({
    success: true,
    minLength: 10,
    rules: passwordChecks("").map((c) => ({ id: c.id, label: c.label })),
  });
});

router.get("/me", async (req, res) => {
  const identity = getDeveloperPortalUser(req);
  if (!identity) {
    res.status(401).json({ success: false, message: "Not signed in" });
    return;
  }
  try {
    const activeLead = await getActiveLeadForPortalUser(identity.userId);
    res.json({
      success: true,
      user: { id: identity.userId, email: identity.email },
      activeLead,
    });
  } catch (err) {
    logger.error({ err }, "developer auth me");
    res.status(500).json({ success: false, message: "Could not load session" });
  }
});

router.post("/register", async (req: Request, res: Response) => {
  if (!developerPortalSessionConfigured()) {
    res.status(503).json({
      success: false,
      message: "Developer sign-in is not configured (set DEV_PORTAL_SESSION_SECRET or SESSION_SECRET, min 16 chars).",
    });
    return;
  }

  const body = req.body as { email?: string; password?: string; confirmPassword?: string; fullName?: string };
  const email = normalizePortalEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Valid email is required" });
    return;
  }
  const policy = validateDeveloperPassword(password);
  if (!policy.ok) {
    res.status(400).json({ success: false, message: policy.message });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ success: false, message: "Passwords do not match" });
    return;
  }

  try {
    const existing = await findPortalUserByEmail(email);
    if (existing) {
      res.status(409).json({ success: false, message: "An account with this email already exists. Sign in instead." });
      return;
    }
    const user = await createPortalUser({ email, password, fullName: body.fullName });
    const token = issueDeveloperPortalToken({ userId: user.id, email: user.email });
    if (!token) {
      res.status(500).json({ success: false, message: "Could not create session" });
      return;
    }
    setDeveloperPortalCookie(res, token);
    res.status(201).json({
      success: true,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });
  } catch (err) {
    logger.error({ err }, "developer register");
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  if (!developerPortalSessionConfigured()) {
    res.status(503).json({ success: false, message: "Developer sign-in is not configured." });
    return;
  }

  const email = normalizePortalEmail(String((req.body as { email?: string }).email ?? ""));
  const password = String((req.body as { password?: string }).password ?? "");
  if (!email || !password) {
    res.status(400).json({ success: false, message: "Email and password required" });
    return;
  }

  try {
    const user = await verifyPortalUserPassword(email, password);
    if (!user) {
      res.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }
    const token = issueDeveloperPortalToken({ userId: user.id, email: user.email });
    if (!token) {
      res.status(500).json({ success: false, message: "Could not create session" });
      return;
    }
    setDeveloperPortalCookie(res, token);
    const activeLead = await getActiveLeadForPortalUser(user.id);
    res.json({
      success: true,
      user: { id: user.id, email: user.email, fullName: user.full_name },
      activeLead,
    });
  } catch (err) {
    logger.error({ err }, "developer login");
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  clearDeveloperPortalCookie(res);
  res.json({ success: true });
});

router.post("/forgot-password", async (req, res) => {
  const email = normalizePortalEmail(String((req.body as { email?: string }).email ?? ""));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Valid email is required" });
    return;
  }

  try {
    const user = await findPortalUserByEmail(email);
    if (user) {
      const otp = String(crypto.randomInt(100000, 999999));
      await stateSetJson(resetKey(email), { otp, userId: user.id, expiresAt: Date.now() + RESET_OTP_TTL_MS }, RESET_OTP_TTL_MS);

      logger.info({ email }, "developer password reset OTP issued");
    }

    const devOtp =
      user && process.env.NODE_ENV !== "production"
        ? (await stateGetJson<{ otp: string }>(resetKey(email)))?.otp
        : undefined;

    res.json({
      success: true,
      message: "If an account exists for this email, we sent a 6-digit reset code.",
      devOtp,
    });
  } catch (err) {
    logger.error({ err }, "developer forgot password");
    res.status(500).json({ success: false, message: "Could not process request" });
  }
});

router.post("/reset-password", async (req, res) => {
  const body = req.body as { email?: string; otp?: string; password?: string; confirmPassword?: string };
  const email = normalizePortalEmail(String(body.email ?? ""));
  const otp = String(body.otp ?? "").trim();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!email || !otp) {
    res.status(400).json({ success: false, message: "Email and OTP required" });
    return;
  }
  const policy = validateDeveloperPassword(password);
  if (!policy.ok) {
    res.status(400).json({ success: false, message: policy.message });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ success: false, message: "Passwords do not match" });
    return;
  }

  try {
    const entry = await stateGetJson<{ otp: string; userId: number; expiresAt: number }>(resetKey(email));
    if (!entry) {
      res.status(400).json({ success: false, message: "Reset code expired or not found. Request a new one." });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      await stateDelete(resetKey(email));
      res.status(400).json({ success: false, message: "Reset code has expired." });
      return;
    }
    if (entry.otp !== otp) {
      res.status(400).json({ success: false, message: "Incorrect reset code." });
      return;
    }
    await updatePortalUserPassword(entry.userId, password);
    await stateDelete(resetKey(email));
    res.json({ success: true, message: "Password updated. You can sign in now." });
  } catch (err) {
    logger.error({ err }, "developer reset password");
    res.status(500).json({ success: false, message: "Could not reset password" });
  }
});

export default router;
