import { query } from "./db";

let columnEnsured = false;

export async function ensureChatMemberHistoryClearedColumn(): Promise<void> {
  if (columnEnsured) return;
  await query(
    `ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ`,
  );
  columnEnsured = true;
}

/** Only messages sent after the user cleared/deleted this chat on their device. */
export function messageAfterHistoryClearedSql(memberAlias: string): string {
  return `m.created_at > COALESCE(${memberAlias}.history_cleared_at, '-infinity'::timestamptz)`;
}
