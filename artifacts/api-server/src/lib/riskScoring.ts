import { query } from "./db";

/** User trust & safety risk score (0–100). */

export type UserRiskSignals = {
  strikeCount: number;
  permanentlySuspended: boolean;
  moderationEvents30d: number;
  reportsReceived7d: number;
  reportsReceived30d: number;
  messages24h: number;
  accountAgeDays: number;
};

export function computeUserRiskScore(signals: UserRiskSignals): number {
  if (signals.permanentlySuspended) return 100;

  let score = 0;
  score += Math.min(35, signals.strikeCount * 12);
  score += Math.min(25, signals.moderationEvents30d * 5);
  score += Math.min(20, signals.reportsReceived7d * 4 + Math.min(8, signals.reportsReceived30d));

  if (signals.messages24h > 500) score += 20;
  else if (signals.messages24h > 200) score += 12;
  else if (signals.messages24h > 80) score += 6;

  if (signals.accountAgeDays < 3) score += 15;
  else if (signals.accountAgeDays < 14) score += 8;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function riskTier(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export async function fetchUserRiskSignals(userId: number): Promise<UserRiskSignals> {
  const r = await query(
    `SELECT
        COALESCE(ms.strike_count, 0)::int AS strike_count,
        COALESCE(ms.permanently_suspended, FALSE) AS permanently_suspended,
        (SELECT COUNT(*)::int FROM moderation_events me
         WHERE me.user_id = $1 AND me.created_at > NOW() - INTERVAL '30 days') AS moderation_events_30d,
        (SELECT COUNT(*)::int FROM user_reports ur
         WHERE ur.reported_user_id = $1 AND ur.created_at > NOW() - INTERVAL '7 days') AS reports_7d,
        (SELECT COUNT(*)::int FROM user_reports ur
         WHERE ur.reported_user_id = $1 AND ur.created_at > NOW() - INTERVAL '30 days') AS reports_30d,
        (SELECT COUNT(*)::int FROM messages m
         WHERE m.sender_id = $1 AND m.created_at > NOW() - INTERVAL '24 hours') AS messages_24h,
        GREATEST(0, EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 86400)::int AS account_age_days
     FROM users u
     LEFT JOIN user_moderation_state ms ON ms.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const row = r.rows[0] as Record<string, number | boolean> | undefined;
  if (!row) {
    return {
      strikeCount: 0,
      permanentlySuspended: false,
      moderationEvents30d: 0,
      reportsReceived7d: 0,
      reportsReceived30d: 0,
      messages24h: 0,
      accountAgeDays: 0,
    };
  }
  return {
    strikeCount: Number(row.strike_count ?? 0),
    permanentlySuspended: Boolean(row.permanently_suspended),
    moderationEvents30d: Number(row.moderation_events_30d ?? 0),
    reportsReceived7d: Number(row.reports_7d ?? 0),
    reportsReceived30d: Number(row.reports_30d ?? 0),
    messages24h: Number(row.messages_24h ?? 0),
    accountAgeDays: Number(row.account_age_days ?? 0),
  };
}

export async function getUserRiskScore(userId: number): Promise<{ score: number; tier: ReturnType<typeof riskTier>; signals: UserRiskSignals }> {
  const signals = await fetchUserRiskSignals(userId);
  const score = computeUserRiskScore(signals);
  return { score, tier: riskTier(score), signals };
}

/** Suggest admin action from risk + open reports. */
export function suggestModerationAction(
  riskScore: number,
  strikeCount: number,
  openReports: number,
): "none" | "warn" | "suspend_24h" | "suspend_7d" | "permanent_ban" {
  if (riskScore >= 90 || (strikeCount >= 3 && openReports >= 2)) return "permanent_ban";
  if (riskScore >= 70 || openReports >= 5) return "suspend_7d";
  if (riskScore >= 50 || openReports >= 3) return "suspend_24h";
  if (riskScore >= 35 || openReports >= 1) return "warn";
  return "none";
}
