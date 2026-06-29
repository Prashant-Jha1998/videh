import { query } from "./db";
import { resolveStoredMediaUrlEnv } from "./mediaStorage";
import { ensureDeveloperChannelColumns } from "./developerChannel";

function phoneDigits(column: string): string {
  return `regexp_replace(COALESCE(${column}, ''), '[^0-9]', '', 'g')`;
}

export type BusinessChannelPublic = {
  displayName: string;
  logoUrl: string | null;
  joinedAt: string | null;
  businessAccountId: string | null;
  businessCategory: string | null;
};

/** True when this Videh user is a verified Business API channel sender. */
export async function lookupBusinessChannelByUserId(
  userId: number,
): Promise<BusinessChannelPublic | null> {
  await ensureDeveloperChannelColumns();

  const userRes = await query(
    `SELECT phone, name, avatar_url FROM users WHERE id = $1`,
    [userId],
  );
  const user = userRes.rows[0] as { phone?: string; name?: string; avatar_url?: string } | undefined;
  if (!user?.phone) return null;

  const userDigits = phoneDigits("$1");
  const channelDigits = phoneDigits("a.channel_phone");

  const accountRes = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(l.display_name), ''), NULLIF(TRIM(l.company_name), ''), NULLIF(TRIM(u.name), ''), 'Business') AS display_name,
       COALESCE(NULLIF(TRIM(l.logo_url), ''), NULLIF(TRIM(u.avatar_url), '')) AS logo_url,
       COALESCE(
         a.channel_verified_at,
         l.channel_verified_at,
         a.approved_at,
         a.created_at,
         l.paid_at,
         l.reviewed_at
       ) AS joined_at,
       a.videh_business_account_id AS business_account_id,
       NULLIF(TRIM(l.business_category), '') AS business_category
     FROM developer_api_accounts a
     JOIN developer_leads l ON l.id = a.lead_id
     LEFT JOIN users u ON u.id = $2
     WHERE a.channel_status = 'verified'
       AND ${channelDigits} = ${userDigits}
     LIMIT 1`,
    [user.phone, userId],
  );

  if (accountRes.rows.length > 0) {
    const row = accountRes.rows[0] as {
      display_name: string;
      logo_url: string | null;
      joined_at: string | null;
      business_account_id: string | null;
      business_category: string | null;
    };
    return {
      displayName: row.display_name,
      logoUrl: resolveStoredMediaUrlEnv(row.logo_url),
      joinedAt: row.joined_at,
      businessAccountId: row.business_account_id,
      businessCategory: row.business_category,
    };
  }

  const leadRes = await query(
    `SELECT
       COALESCE(NULLIF(TRIM(l.display_name), ''), NULLIF(TRIM(l.company_name), ''), NULLIF(TRIM(u.name), ''), 'Business') AS display_name,
       COALESCE(NULLIF(TRIM(l.logo_url), ''), NULLIF(TRIM(u.avatar_url), '')) AS logo_url,
       COALESCE(
         l.channel_verified_at,
         l.paid_at,
         l.reviewed_at
       ) AS joined_at,
       l.videh_business_account_id AS business_account_id,
       NULLIF(TRIM(l.business_category), '') AS business_category
     FROM developer_leads l
     LEFT JOIN users u ON u.id = $2
     WHERE l.channel_status = 'verified'
       AND ${phoneDigits("l.channel_phone")} = ${userDigits}
     LIMIT 1`,
    [user.phone, userId],
  );

  if (leadRes.rows.length === 0) return null;

  const row = leadRes.rows[0] as {
    display_name: string;
    logo_url: string | null;
    joined_at: string | null;
    business_account_id: string | null;
    business_category: string | null;
  };

  return {
    displayName: row.display_name,
    logoUrl: resolveStoredMediaUrlEnv(row.logo_url),
    joinedAt: row.joined_at,
    businessAccountId: row.business_account_id,
    businessCategory: row.business_category,
  };
}
