import { query } from "./db";

type ActivityType = "chat_message" | "story_status" | "video_share" | "contact_share" | "broadcast";

type ModerationDecision =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      code: "temporary_suspension" | "permanent_suspension";
      message: string;
      suspendedUntil?: string | null;
      strikeCount: number;
      alert: string;
    };

let ensured = false;

async function ensureTables(): Promise<void> {
  if (ensured) return;
  await query(
    `CREATE TABLE IF NOT EXISTS user_moderation_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      strike_count INTEGER NOT NULL DEFAULT 0,
      suspended_until TIMESTAMPTZ,
      permanently_suspended BOOLEAN NOT NULL DEFAULT FALSE,
      last_reason TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    [],
  );
  await query(
    `CREATE TABLE IF NOT EXISTS moderation_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      excerpt TEXT,
      severity TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    [],
  );
  ensured = true;
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectViolation(content: string): { reason: string; severity: "high" | "critical" } | null {
  const text = normalizeText(content);
  if (!text) return null;

  const criticalPatterns = [
    /\b(child porn|child pornography|csam|minor sexvideo|sexual content with minor)\b/i,
    /\b(bomb making|how to make bomb|join terror|terror recruitment)\b/i,
  ];
  for (const p of criticalPatterns) {
    if (p.test(text)) return { reason: "Severe prohibited content detected", severity: "critical" };
  }

  const highPatterns = [
    /\b(extremist propaganda|terror attack plan|buy illegal weapon)\b/i,
    /\b(explicit sexual video of minor|underage explicit)\b/i,
  ];
  for (const p of highPatterns) {
    if (p.test(text)) return { reason: "High-risk prohibited content detected", severity: "high" };
  }
  return null;
}

function buildCombinedText(payload: {
  content?: string | null;
  mediaUrl?: string | null;
  type?: string | null;
}): string {
  return [payload.type ?? "", payload.content ?? "", payload.mediaUrl ?? ""].join(" ").trim();
}

function alertText(msg: string): string {
  return `Policy Alert: ${msg}`;
}

export async function enforceModerationForActivity(
  userId: number,
  activityType: ActivityType,
  payload: { content?: string | null; mediaUrl?: string | null; type?: string | null },
): Promise<ModerationDecision> {
  await ensureTables();
  const stateRes = await query(
    `SELECT strike_count, suspended_until, permanently_suspended
     FROM user_moderation_state WHERE user_id = $1`,
    [userId],
  );
  const state = stateRes.rows[0] as
    | { strike_count: number; suspended_until: string | null; permanently_suspended: boolean }
    | undefined;

  if (state?.permanently_suspended) {
    return {
      allowed: false,
      code: "permanent_suspension",
      message: "Your account is permanently suspended due to repeated severe policy violations.",
      suspendedUntil: null,
      strikeCount: state.strike_count ?? 2,
      alert: alertText("Account permanently suspended."),
    };
  }

  if (state?.suspended_until) {
    const untilMs = Date.parse(state.suspended_until);
    if (!Number.isNaN(untilMs) && untilMs > Date.now()) {
      return {
        allowed: false,
        code: "temporary_suspension",
        message: "Your account is temporarily suspended for 24 hours due to policy violation.",
        suspendedUntil: state.suspended_until,
        strikeCount: state.strike_count ?? 1,
        alert: alertText(`Account suspended until ${new Date(untilMs).toISOString()}.`),
      };
    }
  }

  const combined = buildCombinedText(payload);
  const violation = detectViolation(combined);
  if (!violation) return { allowed: true };

  const previousStrikes = state?.strike_count ?? 0;
  const excerpt = combined.slice(0, 220);

  if (previousStrikes >= 1) {
    await query(
      `INSERT INTO user_moderation_state (user_id, strike_count, suspended_until, permanently_suspended, last_reason, updated_at)
       VALUES ($1, $2, NULL, TRUE, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET strike_count = EXCLUDED.strike_count,
           suspended_until = NULL,
           permanently_suspended = TRUE,
           last_reason = EXCLUDED.last_reason,
           updated_at = NOW()`,
      [userId, Math.max(previousStrikes + 1, 2), violation.reason],
    );
    await query(
      `INSERT INTO moderation_events (user_id, activity_type, reason, excerpt, severity, action_taken)
       VALUES ($1, $2, $3, $4, $5, 'permanent_suspension')`,
      [userId, activityType, violation.reason, excerpt, violation.severity],
    );
    return {
      allowed: false,
      code: "permanent_suspension",
      message: "Severe repeated violation detected. Account permanently suspended.",
      suspendedUntil: null,
      strikeCount: Math.max(previousStrikes + 1, 2),
      alert: alertText("Repeated violation detected. Permanent account suspension applied."),
    };
  }

  await query(
    `INSERT INTO user_moderation_state (user_id, strike_count, suspended_until, permanently_suspended, last_reason, updated_at)
     VALUES ($1, 1, NOW() + INTERVAL '24 hours', FALSE, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET strike_count = 1,
         suspended_until = NOW() + INTERVAL '24 hours',
         permanently_suspended = FALSE,
         last_reason = EXCLUDED.last_reason,
         updated_at = NOW()`,
    [userId, violation.reason],
  );
  await query(
    `INSERT INTO moderation_events (user_id, activity_type, reason, excerpt, severity, action_taken)
     VALUES ($1, $2, $3, $4, $5, 'temporary_24h_suspension')`,
    [userId, activityType, violation.reason, excerpt, violation.severity],
  );

  const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    allowed: false,
    code: "temporary_suspension",
    message: "Policy violation detected. Account suspended for 24 hours.",
    suspendedUntil: until,
    strikeCount: 1,
    alert: alertText(`Violation detected in ${activityType}. 24-hour suspension applied.`),
  };
}

