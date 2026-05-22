import { useCallback, useEffect, useState } from "react";
import { devFetch } from "../lib/devFetch";

export type PortalTemplate = {
  id: number;
  name: string;
  display_name: string;
  category: string;
  language: string;
  body_preview: string;
  variables: string[];
  status: string;
  approved?: boolean;
  rejection_reason?: string | null;
};

export type PortalAccount = {
  api_key_id: string;
  billing_status: string;
  plan_id?: string;
  amount_inr_monthly?: number;
  messages_sent_total?: number;
  messages_sent_month?: number;
  total_billed_inr?: number;
  usage_billing_month_inr?: number;
  conv_user_initiated_month?: number;
  conv_business_marketing_month?: number;
  conv_business_utility_month?: number;
  conv_free_user_used_month?: number;
  videh_phone_number_id?: string;
  videh_business_account_id?: string;
};

export type PortalData = {
  lead: {
    id?: number;
    reference_code: string;
    status: string;
    wizard_step?: string;
    company_name: string;
    plan_id?: string;
    payment_status?: string;
    payment_method_verified?: boolean;
  };
  account: PortalAccount | null;
  channel?: {
    channel_phone?: string | null;
    channel_status?: string;
    phone_number_id?: string | null;
    business_account_id?: string | null;
  };
  credentials_hint?: {
    phone_number_id?: string | null;
    business_account_id?: string | null;
  };
  templates: PortalTemplate[];
  approvedCount: number;
};

export const PORTAL_STATUS_LABELS: Record<string, string> = {
  draft: "Application in progress",
  payment_pending: "Awaiting payment verification",
  paid: "Paid — document review",
  documents_review: "Documents under review",
  channel_setup: "Phone channel setup",
  templates_review: "Templates under review",
  approved: "API access active",
  rejected: "Rejected",
  suspended: "Suspended",
};

export function useDeveloperPortal(opts: {
  leadId: string;
  reference: string;
  enabled?: boolean;
}) {
  const { leadId, reference, enabled = true } = opts;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    let id = leadId.trim();
    let ref = reference.trim();

    setBusy(true);
    setError("");
    try {
      const meRes = await devFetch("/api/developer-auth/me");
      const me = (await meRes.json()) as {
        success?: boolean;
        user?: { email: string };
        activeLead?: { id: number; reference_code: string };
      };
      if (!meRes.ok || !me.success) {
        setSignedInEmail(null);
        setError("Sign in to manage your developer account.");
        setData(null);
        return;
      }
      setSignedInEmail(me.user?.email ?? null);
      if (me.activeLead?.id) {
        id = String(me.activeLead.id);
        ref = me.activeLead.reference_code;
      }
      if (!id) {
        setError("No application linked to this account.");
        setData(null);
        return;
      }

      const portalQs = ref ? `?reference=${encodeURIComponent(ref)}` : "";
      const tplQs = ref ? `?reference=${encodeURIComponent(ref)}` : "";
      const [portalRes, tplRes] = await Promise.all([
        devFetch(`/api/developer-leads/${id}/portal${portalQs}`),
        devFetch(`/api/developer-leads/${id}/templates${tplQs}`),
      ]);
      const portal = (await portalRes.json()) as {
        success?: boolean;
        message?: string;
        lead?: PortalData["lead"];
        account?: PortalData["account"];
        channel?: PortalData["channel"];
        credentials_hint?: PortalData["credentials_hint"];
      };
      const tpl = (await tplRes.json()) as { templates?: PortalTemplate[]; approvedCount?: number };
      if (!portalRes.ok || !portal.success) {
        setError(
          portal.message ??
            (portalRes.status === 401
              ? "Session expired — sign out and sign in again."
              : portalRes.status === 404
                ? "Application not linked to your account. Sign in with the same email you used to apply."
                : "Could not load application data."),
        );
        setData(null);
        return;
      }
      setData({
        lead: portal.lead!,
        account: portal.account ?? null,
        channel: portal.channel,
        credentials_hint: portal.credentials_hint,
        templates: tpl.templates ?? [],
        approvedCount: tpl.approvedCount ?? 0,
      });
    } catch {
      setError("Could not load data. Try again later.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [leadId, reference, enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setBusy(false);
      return;
    }
    void load();
  }, [load, enabled]);

  return { data, busy, error, setError, load, signedInEmail };
}
