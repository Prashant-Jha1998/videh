/** Priority scoring for user report triage (0–100, higher = review first). */

export type ReportPrioritySignals = {
  createdAt: Date;
  reason: string;
  details: string | null;
  blockAfterReport: boolean;
  duplicateReports7d: number;
  reportedUserRisk: number;
  reportedUserStrikes: number;
  reportedUserSuspended: boolean;
};

const HIGH_RISK_REASON =
  /\b(scam|fraud|impersonat|phish|child|minor|csam|terror|rape|threat|kill|weapon|extortion|blackmail)\b/i;
const MED_RISK_REASON = /\b(harass|abuse|spam|nude|explicit|stalk|bully|hate)\b/i;

export function computeReportPriority(signals: ReportPrioritySignals): number {
  let score = 0;

  const hoursOld = (Date.now() - signals.createdAt.getTime()) / 3_600_000;
  score += Math.max(0, 25 - hoursOld * 0.45);

  score += Math.min(30, signals.duplicateReports7d * 8);

  score += (Math.min(100, signals.reportedUserRisk) / 100) * 25;

  score += Math.min(10, signals.reportedUserStrikes * 3);

  if (signals.blockAfterReport) score += 10;

  const text = `${signals.reason} ${signals.details ?? ""}`;
  if (HIGH_RISK_REASON.test(text)) score += 20;
  else if (MED_RISK_REASON.test(text)) score += 12;

  if (signals.reportedUserSuspended) score += 5;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function priorityLabel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}
