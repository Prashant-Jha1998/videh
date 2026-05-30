import { Router, type Request, type Response } from "express";
import { assertSameUser, requireAuth } from "../lib/auth";
import { executeAssistantAction, loadAssistantUserContext } from "../lib/assistantExecutor";
import { answerFromDatabase, databaseAssistantFallback } from "../lib/assistantDbAnswer";
import { answerVidehQuestion, finalizeAssistantSpeak } from "../lib/assistantFinalize";
import { buildActivationGreeting } from "../lib/assistantGreeting";
import { intentToPlanned, parseAssistantIntent } from "../lib/assistantIntents";
import {
  detectAssistantLanguage,
  firstName,
  normalizeLangCode,
  toSpeechLocale,
  type AssistantLangCode,
} from "../lib/assistantLanguages";
import { resolveAssistantPlan } from "../lib/assistantPlanner";
import { evaluateAssistantSafety, safetyRefusal } from "../lib/assistantSafety";
import {
  compareVoiceFingerprints,
  normalizeFingerprint,
  type VoiceFingerprint,
} from "../lib/assistantVoice";
import { query } from "../lib/db";

const router = Router();
router.use(requireAuth);

async function loadEnrolledFingerprints(userId: number): Promise<VoiceFingerprint[]> {
  const r = await query(
    `SELECT fingerprint_json FROM assistant_voice_samples WHERE user_id = $1 ORDER BY sample_index`,
    [userId],
  );
  return r.rows
    .map((row: { fingerprint_json: unknown }) => normalizeFingerprint(row.fingerprint_json))
    .filter((fp): fp is VoiceFingerprint => Boolean(fp));
}

function jsonLang(res: Response, lang: AssistantLangCode, body: Record<string, unknown>) {
  res.json({ ...body, langCode: lang, speechLocale: toSpeechLocale(lang) });
}

router.get("/prefs", async (req: Request, res: Response) => {
  const userId = Number((req as any).authUserId);
  try {
    const r = await query(
      `SELECT assistant_enabled, assistant_voice_enrolled, assistant_listen_locked, name
       FROM users WHERE id = $1`,
      [userId],
    );
    const row = r.rows[0] as {
      assistant_enabled?: boolean;
      assistant_voice_enrolled?: boolean;
      assistant_listen_locked?: boolean;
      name?: string;
    } | undefined;
    if (!row) {
      res.status(404).json({ success: false });
      return;
    }
    res.json({
      success: true,
      prefs: {
        enabled: Boolean(row.assistant_enabled),
        voiceEnrolled: Boolean(row.assistant_voice_enrolled),
        listenWhenLocked: Boolean(row.assistant_listen_locked),
        userName: row.name?.trim() || "User",
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "assistant prefs get");
    res.status(500).json({ success: false });
  }
});

router.patch("/prefs", async (req: Request, res: Response) => {
  const userId = Number((req as any).authUserId);
  const body = req.body as { enabled?: boolean; listenWhenLocked?: boolean };
  try {
    await query(
      `UPDATE users SET
         assistant_enabled = COALESCE($2, assistant_enabled),
         assistant_listen_locked = COALESCE($3, assistant_listen_locked),
         updated_at = NOW()
       WHERE id = $1`,
      [userId, body.enabled ?? null, body.listenWhenLocked ?? null],
    );
    res.json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "assistant prefs patch");
    res.status(500).json({ success: false });
  }
});

router.delete("/enroll", async (req: Request, res: Response) => {
  const userId = Number((req as any).authUserId);
  try {
    await query(`DELETE FROM assistant_voice_samples WHERE user_id = $1`, [userId]);
    await query(
      `UPDATE users SET assistant_voice_enrolled = FALSE, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    res.json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "assistant enroll delete");
    res.status(500).json({ success: false });
  }
});

router.post("/enroll", async (req: Request, res: Response) => {
  const userId = Number((req as any).authUserId);
  const body = req.body as { samples?: unknown[] };
  const samples = (body.samples ?? [])
    .map((s) => normalizeFingerprint(s))
    .filter((s): s is VoiceFingerprint => Boolean(s));
  if (samples.length < 1) {
    res.status(400).json({ success: false, message: "At least 1 voice sample is required." });
    return;
  }
  try {
    await query(`DELETE FROM assistant_voice_samples WHERE user_id = $1`, [userId]);
    for (let i = 0; i < samples.length; i++) {
      await query(
        `INSERT INTO assistant_voice_samples (user_id, sample_index, fingerprint_json)
         VALUES ($1, $2, $3)`,
        [userId, i, JSON.stringify(samples[i])],
      );
    }
    await query(
      `UPDATE users SET assistant_voice_enrolled = TRUE, assistant_enabled = TRUE, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    res.json({ success: true, enrolled: samples.length });
  } catch (err) {
    req.log?.error?.({ err }, "assistant enroll");
    res.status(500).json({ success: false, message: "Could not save voice profile." });
  }
});

router.post("/verify-voice", async (req: Request, res: Response) => {
  const userId = Number((req as any).authUserId);
  const probe = normalizeFingerprint((req.body as { fingerprint?: unknown }).fingerprint);
  if (!probe) {
    res.status(400).json({ success: false, message: "Invalid fingerprint." });
    return;
  }
  try {
    const enrolled = await loadEnrolledFingerprints(userId);
    const { match, score } = compareVoiceFingerprints(enrolled, probe);
    res.json({ success: true, match, score });
  } catch (err) {
    req.log?.error?.({ err }, "assistant verify voice");
    res.status(500).json({ success: false });
  }
});

router.post("/command", async (req: Request, res: Response) => {
  const userId = Number((req as any).authUserId);
  const body = req.body as { text?: string; locale?: string };
  const text = String(body.text ?? "").trim();
  if (!text) {
    res.status(400).json({ success: false, message: "text is required." });
    return;
  }

  const lang = detectAssistantLanguage(text, body.locale);

  try {
    const ctx = await loadAssistantUserContext(userId);
    const name = firstName(ctx.userName);
    const safety = evaluateAssistantSafety(text);
    if (!safety.safe) {
      jsonLang(res, lang, {
        success: true,
        intent: "blocked",
        speak: safetyRefusal(lang, safety.category),
        actions: [],
      });
      return;
    }

    const ruleIntent = parseAssistantIntent(text);
    if (ruleIntent.type === "greeting") {
      jsonLang(res, lang, {
        success: true,
        intent: "greeting",
        speak: buildActivationGreeting(ctx.userName, lang),
        actions: [],
      });
      return;
    }

    if (ruleIntent.type !== "unknown") {
      const plan = intentToPlanned(ruleIntent);
      const result = await executeAssistantAction(ctx, plan, lang);
      jsonLang(res, lang, {
        success: true,
        intent: result.intent,
        speak: result.speak,
        actions: result.actions,
        data: result.data,
      });
      return;
    }

    const plan = await resolveAssistantPlan(text, ctx, lang);

    if (plan.intent === "project_qa") {
      const dbSpeak = await answerFromDatabase(text, ctx, lang);
      const speak = dbSpeak
        ?? plan.speak
        ?? await answerVidehQuestion(text, ctx.userName, lang, dbSpeak)
        ?? databaseAssistantFallback(lang, ctx.userName);
      jsonLang(res, lang, {
        success: true,
        intent: "project_qa",
        speak,
        actions: [],
      });
      return;
    }

    if (plan.intent === "reply" && plan.speak) {
      jsonLang(res, lang, {
        success: true,
        intent: "ai_reply",
        speak: plan.speak,
        actions: [],
      });
      return;
    }

    if (plan.intent === "unknown") {
      const dbSpeak = await answerFromDatabase(text, ctx, lang);
      const qaSpeak = dbSpeak
        ?? await answerVidehQuestion(text, ctx.userName, lang, dbSpeak)
        ?? databaseAssistantFallback(lang, ctx.userName);
      jsonLang(res, lang, {
        success: true,
        intent: dbSpeak ? "db_answer" : "qa",
        speak: qaSpeak,
        actions: [],
      });
      return;
    }

    const result = await executeAssistantAction(ctx, plan, lang);
    const speak = process.env["ASSISTANT_AI_POLISH"] === "1"
      ? await finalizeAssistantSpeak({
          userName: ctx.userName,
          lang,
          userCommand: text,
          intent: result.intent,
          success: result.success,
          fallbackSpeak: result.speak,
          actionDetails: (result.data as Record<string, unknown>) ?? {},
        })
      : result.speak;

    jsonLang(res, lang, {
      success: true,
      intent: result.intent,
      speak,
      actions: result.actions,
      data: result.data,
    });
  } catch (err) {
    req.log?.error?.({ err }, "assistant command");
    res.status(500).json({ success: false, message: "Assistant command failed." });
  }
});

router.get("/greeting/:userId", async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  if (!assertSameUser(req, res, userId)) return;
  const lang = normalizeLangCode(String(req.query.locale ?? "en"));
  try {
    const ctx = await loadAssistantUserContext(userId);
    jsonLang(res, lang, {
      success: true,
      speak: buildActivationGreeting(ctx.userName, lang),
    });
  } catch {
    res.status(500).json({ success: false });
  }
});

export default router;
