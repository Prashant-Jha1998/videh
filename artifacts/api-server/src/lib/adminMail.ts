import { logger } from "./logger";

function alertRecipients(): string[] {
  const raw = process.env["ADMIN_ALERT_EMAIL"]?.trim() || process.env["ADMIN_EMAIL"]?.trim() || "";
  return raw
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function adminMailConfigured(): boolean {
  if (alertRecipients().length === 0) return false;
  return Boolean(process.env["RESEND_API_KEY"]?.trim() || process.env["ADMIN_ALERT_WEBHOOK_URL"]?.trim());
}

async function sendViaResend(to: string[], subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["RESEND_FROM"]?.trim() || "Videh Admin <noreply@videh.co.in>";
  if (!key) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body }, "Resend email failed");
    return false;
  }
  return true;
}

async function sendViaWebhook(subject: string, text: string): Promise<boolean> {
  const url = process.env["ADMIN_ALERT_WEBHOOK_URL"]?.trim();
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, text, source: "videh-admin-sla" }),
  });
  return res.ok;
}

export async function sendAdminAlertEmail(subject: string, html: string, text: string): Promise<boolean> {
  const to = alertRecipients();
  if (to.length === 0) {
    logger.warn("ADMIN_ALERT_EMAIL not set; skipping alert email");
    return false;
  }
  try {
    if (process.env["RESEND_API_KEY"]?.trim()) {
      return await sendViaResend(to, subject, html, text);
    }
    if (process.env["ADMIN_ALERT_WEBHOOK_URL"]?.trim()) {
      return await sendViaWebhook(subject, text);
    }
    logger.warn("Set RESEND_API_KEY or ADMIN_ALERT_WEBHOOK_URL for SLA alerts");
    return false;
  } catch (err) {
    logger.error({ err }, "sendAdminAlertEmail failed");
    return false;
  }
}
