import { query } from "./db";

type GroupCreationDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "temporary_suspension" | "permanent_suspension";
      message: string;
      suspendedUntil?: string | null;
      strikeCount: number;
      alert: string;
    };

const DAILY_GROUP_LIMIT = 3;
let ensured = false;

async function ensureTables(): Promise<void> {
  if (ensured) return;
  await query(
    `CREATE TABLE IF NOT EXISTS user_group_creation_policy (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      strike_count INTEGER NOT NULL DEFAULT 0,
      suspended_until TIMESTAMPTZ,
      permanently_suspended BOOLEAN NOT NULL DEFAULT FALSE,
      last_reason TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    [],
  );
  ensured = true;
}

export async function enforceGroupCreationPolicy(userId: number): Promise<GroupCreationDecision> {
  await ensureTables();
  const stateRes = await query(
    `SELECT strike_count, suspended_until, permanently_suspended
     FROM user_group_creation_policy
     WHERE user_id = $1`,
    [userId],
  );
  const state = stateRes.rows[0] as
    | { strike_count: number; suspended_until: string | null; permanently_suspended: boolean }
    | undefined;

  if (state?.permanently_suspended) {
    return {
      allowed: false,
      code: "permanent_suspension",
      message: "Your account is permanently suspended from creating groups due to repeated policy violations.",
      suspendedUntil: null,
      strikeCount: state.strike_count ?? 2,
      alert: "Policy Alert: Permanent suspension applied for repeated group-creation abuse.",
    };
  }

  if (state?.suspended_until) {
    const untilMs = Date.parse(state.suspended_until);
    if (!Number.isNaN(untilMs) && untilMs > Date.now()) {
      return {
        allowed: false,
        code: "temporary_suspension",
        message: "Group creation limit exceeded. Your account is temporarily suspended for 24 hours.",
        suspendedUntil: state.suspended_until,
        strikeCount: state.strike_count ?? 1,
        alert: `Policy Alert: Account suspended for group creation abuse until ${new Date(untilMs).toISOString()}.`,
      };
    }
  }

  const dailyRes = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM chats
     WHERE is_group = TRUE
       AND created_by = $1
       AND created_at >= date_trunc('day', NOW())`,
    [userId],
  );
  const createdToday = Number(dailyRes.rows[0]?.cnt ?? 0);
  if (createdToday < DAILY_GROUP_LIMIT) return { allowed: true };

  const previousStrikes = state?.strike_count ?? 0;
  if (previousStrikes >= 1) {
    await query(
      `INSERT INTO user_group_creation_policy
         (user_id, strike_count, suspended_until, permanently_suspended, last_reason, updated_at)
       VALUES ($1, $2, NULL, TRUE, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET strike_count = EXCLUDED.strike_count,
           suspended_until = NULL,
           permanently_suspended = TRUE,
           last_reason = EXCLUDED.last_reason,
           updated_at = NOW()`,
      [userId, previousStrikes + 1, "Exceeded daily group creation limit again after temporary suspension."],
    );
    return {
      allowed: false,
      code: "permanent_suspension",
      message: "Repeated group-creation abuse detected. Account permanently suspended.",
      suspendedUntil: null,
      strikeCount: previousStrikes + 1,
      alert: "Policy Alert: Permanent suspension applied for repeated group-creation abuse.",
    };
  }

  await query(
    `INSERT INTO user_group_creation_policy
       (user_id, strike_count, suspended_until, permanently_suspended, last_reason, updated_at)
     VALUES ($1, 1, NOW() + INTERVAL '24 hours', FALSE, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET strike_count = 1,
         suspended_until = NOW() + INTERVAL '24 hours',
         permanently_suspended = FALSE,
         last_reason = EXCLUDED.last_reason,
         updated_at = NOW()`,
    [userId, "Exceeded daily group creation limit (max 3/day)."],
  );
  return {
    allowed: false,
    code: "temporary_suspension",
    message: "You can create maximum 3 groups per day. Account suspended for 24 hours.",
    suspendedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    strikeCount: 1,
    alert: "Policy Alert: Daily group creation limit exceeded. Temporary 24-hour suspension applied.",
  };
}

