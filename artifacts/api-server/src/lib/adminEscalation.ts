import { query } from "./db";
import { ensureAdminPlatformTables } from "./adminPlatform";
import { ensureAdminUsersTable } from "./adminUsers";
import { sendAdminAlertEmail, adminMailConfigured } from "./adminMail";
import { logger } from "./logger";

async function markEscalated(entityType: string, entityId: string, escalationType: string): Promise<boolean> {
  const ins = await query(
    `INSERT INTO admin_escalation_log (entity_type, entity_id, escalation_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (entity_type, entity_id, escalation_type) DO NOTHING
     RETURNING id`,
    [entityType, entityId, escalationType],
  );
  return Boolean(ins.rows[0]);
}

export async function runAdminSlaEscalationJob(): Promise<void> {
  if (!adminMailConfigured()) return;

  await ensureAdminPlatformTables();
  await ensureAdminUsersTable();

  const grievanceAck = await query(
    `SELECT id, ticket_number, complainant_name, sla_ack_due_at
     FROM grievance_tickets
     WHERE status IN ('open', 'in_progress')
       AND first_response_at IS NULL
       AND sla_ack_due_at < NOW()
     ORDER BY sla_ack_due_at ASC
     LIMIT 20`,
    [],
  );

  for (const g of grievanceAck.rows as Array<Record<string, unknown>>) {
    const id = String(g.id);
    const key = await markEscalated("grievance", id, "sla_ack_breach");
    if (!key) continue;
    const ticket = String(g.ticket_number);
    const subject = `[Videh] Grievance SLA breach — ${ticket}`;
    const text = `Grievance ${ticket} (${g.complainant_name}) has no first response past the 36-hour SLA deadline.`;
    await sendAdminAlertEmail(subject, `<p>${text}</p>`, text);
    logger.warn({ ticket }, "Grievance ack SLA escalation sent");
  }

  const grievanceResolve = await query(
    `SELECT id, ticket_number, complainant_name, sla_resolve_due_at
     FROM grievance_tickets
     WHERE status IN ('open', 'in_progress')
       AND resolved_at IS NULL
       AND sla_resolve_due_at < NOW()
     ORDER BY sla_resolve_due_at ASC
     LIMIT 20`,
    [],
  );

  for (const g of grievanceResolve.rows as Array<Record<string, unknown>>) {
    const id = String(g.id);
    const key = await markEscalated("grievance", id, "sla_resolve_breach");
    if (!key) continue;
    const ticket = String(g.ticket_number);
    const subject = `[Videh] Grievance resolution overdue — ${ticket}`;
    const text = `Grievance ${ticket} is past the 15-day resolution target and still open.`;
    await sendAdminAlertEmail(subject, `<p>${text}</p>`, text);
    logger.warn({ ticket }, "Grievance resolve SLA escalation sent");
  }

  const criticalReports = await query(
    `SELECT ur.id, ur.priority_score, ur.reason, ru.phone AS reported_phone
     FROM user_reports ur
     LEFT JOIN users ru ON ru.id = ur.reported_user_id
     WHERE COALESCE(ur.status, 'open') = 'open'
       AND ur.priority_score >= 75
       AND ur.created_at < NOW() - INTERVAL '12 hours'
       AND ur.assigned_admin IS NULL
     ORDER BY ur.priority_score DESC
     LIMIT 15`,
    [],
  );

  for (const r of criticalReports.rows as Array<Record<string, unknown>>) {
    const id = String(r.id);
    const key = await markEscalated("user_report", id, "critical_unassigned");
    if (!key) continue;
    const subject = `[Videh] Critical report unassigned — #${id}`;
    const text = `Report #${id} (priority ${r.priority_score}) against ${r.reported_phone ?? "unknown"} needs triage: ${r.reason}`;
    await sendAdminAlertEmail(subject, `<p>${text}</p>`, text);
    logger.warn({ reportId: id }, "Critical report escalation sent");
  }
}
