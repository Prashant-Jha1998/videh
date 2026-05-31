import { Router, type Request, type Response } from "express";
import { assertSameUser, getAuthUserId, requireAuth } from "../lib/auth";
import { query } from "../lib/db";
import { assertChatMember, getUserDisplayName } from "../lib/khataAccess";
import { buildKhataPdf } from "../lib/khataPdf";
import { buildKhataReminderMessage, formatKhataReminderDateLabel } from "../lib/khataReminder";

const router = Router();
router.use(requireAuth);

let khataTablesEnsured = false;

async function ensureKhataTables() {
  if (khataTablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS khata_entries (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      debtor_name TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      note TEXT,
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS debtor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS creditor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS creditor_name TEXT`);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_khata_entries_chat_created ON khata_entries (chat_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_khata_entries_chat_paid ON khata_entries (chat_id, paid)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_khata_entries_debtor_user ON khata_entries (chat_id, debtor_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_khata_entries_creditor_user ON khata_entries (chat_id, creditor_user_id)`);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ`);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS reminder_scheduled_id INTEGER`);
  await query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS khata_entry_id INTEGER REFERENCES khata_entries(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS bypass_block BOOLEAN NOT NULL DEFAULT FALSE`);
  khataTablesEnsured = true;
}

type KhataRow = {
  id: number;
  chat_id: number;
  created_by: number;
  debtor_name: string;
  debtor_user_id: number | null;
  creditor_user_id: number | null;
  creditor_name: string | null;
  amount: string;
  note: string | null;
  paid: boolean;
  paid_at: string | null;
  paid_by_user_id: number | null;
  created_at: string;
  creator_name?: string;
  debtor_user_name?: string | null;
  creditor_user_name?: string | null;
  paid_by_name?: string | null;
  reminder_at?: string | null;
  reminder_sent?: boolean;
  reminder_scheduled_id?: number | null;
};

const ENTRY_SELECT = `
  SELECT ke.*,
         u.name AS creator_name,
         du.name AS debtor_user_name,
         cu.name AS creditor_user_name,
         pu.name AS paid_by_name
  FROM khata_entries ke
  JOIN users u ON u.id = ke.created_by
  LEFT JOIN users du ON du.id = ke.debtor_user_id
  LEFT JOIN users cu ON cu.id = ke.creditor_user_id
  LEFT JOIN users pu ON pu.id = ke.paid_by_user_id
`;

function displayDebtor(row: KhataRow): string {
  return row.debtor_user_name ?? row.debtor_name;
}

function displayCreditor(row: KhataRow): string {
  return row.creditor_user_name ?? row.creditor_name ?? "Member";
}

function computeMemberBalances(rows: KhataRow[]) {
  const pending = rows.filter((r) => !r.paid);
  const byUser = new Map<number, { userId: number; name: string; owes: number; owed: number }>();

  const touch = (userId: number, name: string) => {
    if (!byUser.has(userId)) byUser.set(userId, { userId, name, owes: 0, owed: 0 });
    return byUser.get(userId)!;
  };

  for (const row of pending) {
    const amount = Number(row.amount);
    if (row.debtor_user_id && row.creditor_user_id) {
      touch(row.debtor_user_id, displayDebtor(row)).owes += amount;
      touch(row.creditor_user_id, displayCreditor(row)).owed += amount;
    }
  }

  const memberBalances = [...byUser.values()]
    .map((m) => ({ ...m, net: m.owed - m.owes }))
    .sort((a, b) => b.net - a.net);

  const pairwise: Array<{ fromUserId: number; fromName: string; toUserId: number; toName: string; amount: number }> = [];
  const ids = memberBalances.map((m) => m.userId);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      let net = 0;
      for (const row of pending) {
        if (!row.debtor_user_id || !row.creditor_user_id) continue;
        const amt = Number(row.amount);
        if (row.debtor_user_id === a && row.creditor_user_id === b) net += amt;
        if (row.debtor_user_id === b && row.creditor_user_id === a) net -= amt;
      }
      if (Math.abs(net) < 0.01) continue;
      if (net > 0) {
        pairwise.push({
          fromUserId: a,
          fromName: byUser.get(a)!.name,
          toUserId: b,
          toName: byUser.get(b)!.name,
          amount: Math.round(net * 100) / 100,
        });
      } else {
        pairwise.push({
          fromUserId: b,
          fromName: byUser.get(b)!.name,
          toUserId: a,
          toName: byUser.get(a)!.name,
          amount: Math.round(Math.abs(net) * 100) / 100,
        });
      }
    }
  }

  pairwise.sort((x, y) => y.amount - x.amount);
  const totalPending = pending.reduce((s, r) => s + Number(r.amount), 0);

  return { memberBalances, pairwise, totalPending };
}

async function loadChatEntries(chatId: number): Promise<KhataRow[]> {
  const result = await query(
    `${ENTRY_SELECT} WHERE ke.chat_id = $1 ORDER BY ke.created_at DESC`,
    [chatId],
  );
  return result.rows as KhataRow[];
}

router.get("/chat/:chatId", async (req: Request, res: Response) => {
  const chatId = Number(req.params.chatId);
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  try {
    await ensureKhataTables();
    const access = await assertChatMember(chatId, userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }
    const entries = await loadChatEntries(chatId);
    res.json({ success: true, entries });
  } catch (err) {
    req.log.error({ err }, "get khata error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/chat/:chatId/summary", async (req: Request, res: Response) => {
  const chatId = Number(req.params.chatId);
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  try {
    await ensureKhataTables();
    const access = await assertChatMember(chatId, userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }
    const entries = await loadChatEntries(chatId);
    const summary = computeMemberBalances(entries);
    res.json({ success: true, ...summary });
  } catch (err) {
    req.log.error({ err }, "khata summary error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/chat/:chatId/pdf", async (req: Request, res: Response) => {
  const chatId = Number(req.params.chatId);
  const userId = getAuthUserId(req);
  const month = String(req.query.month ?? "");
  if (!userId) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  try {
    await ensureKhataTables();
    const access = await assertChatMember(chatId, userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }

    const chatRow = await query(`SELECT group_name, is_group FROM chats WHERE id = $1`, [chatId]);
    const chat = chatRow.rows[0] as { group_name?: string; is_group?: boolean } | undefined;
    const chatTitle = chat?.group_name?.trim() || `Chat #${chatId}`;

    const entries = await loadChatEntries(chatId);
    const monthFilter = /^\d{4}-\d{2}$/.test(month);
    const filtered = monthFilter
      ? entries.filter((e) => e.created_at.startsWith(month))
      : entries;

    const summary = computeMemberBalances(filtered);
    const periodLabel = monthFilter
      ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : "All time";

    const pdf = buildKhataPdf({
      chatTitle,
      periodLabel,
      totalPending: summary.totalPending,
      balances: summary.memberBalances.map((b) => ({ name: b.name, net: b.net })),
      entries: filtered.map((e) => ({
        debtor: displayDebtor(e),
        creditor: displayCreditor(e),
        amount: Number(e.amount),
        note: e.note,
        paid: e.paid,
        created_at: e.created_at,
      })),
    });

    const safeName = `khata_${chatId}_${monthFilter ? month : "all"}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  } catch (err) {
    req.log.error({ err }, "khata pdf error");
    res.status(500).json({ success: false, message: "Could not generate PDF" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const {
    chatId,
    createdBy,
    debtorName,
    debtorUserId,
    creditorUserId,
    creditorName,
    amount,
    note,
    reminderAt,
    enableReminder,
  } = req.body as {
    chatId?: number;
    createdBy?: number;
    debtorName?: string;
    debtorUserId?: number;
    creditorUserId?: number;
    creditorName?: string;
    amount?: number | string;
    note?: string | null;
    reminderAt?: string;
    enableReminder?: boolean;
  };

  if (!chatId || !createdBy || amount == null) {
    res.status(400).json({ success: false, message: "chatId, createdBy, and amount are required" });
    return;
  }
  if (!assertSameUser(req, res, createdBy)) return;

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ success: false, message: "Invalid amount" });
    return;
  }

  try {
    await ensureKhataTables();
    const access = await assertChatMember(chatId, createdBy);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }

    let resolvedDebtorUserId = debtorUserId ? Number(debtorUserId) : null;
    let resolvedCreditorUserId = creditorUserId ? Number(creditorUserId) : Number(createdBy);
    let resolvedDebtorName = debtorName?.trim() ?? "";
    let resolvedCreditorName = creditorName?.trim() ?? "";

    if (resolvedDebtorUserId) {
      const memberOk = await assertChatMember(chatId, resolvedDebtorUserId);
      if (!memberOk.ok) {
        res.status(400).json({ success: false, message: "Debtor must be a chat member." });
        return;
      }
      resolvedDebtorName = await getUserDisplayName(resolvedDebtorUserId);
    } else if (!resolvedDebtorName) {
      res.status(400).json({ success: false, message: "debtorUserId or debtorName required" });
      return;
    }

    if (resolvedCreditorUserId) {
      const memberOk = await assertChatMember(chatId, resolvedCreditorUserId);
      if (!memberOk.ok) {
        res.status(400).json({ success: false, message: "Creditor must be a chat member." });
        return;
      }
      resolvedCreditorName = await getUserDisplayName(resolvedCreditorUserId);
    } else if (resolvedCreditorName) {
      resolvedCreditorUserId = null;
    } else {
      resolvedCreditorName = await getUserDisplayName(createdBy);
      resolvedCreditorUserId = createdBy;
    }

    if (resolvedDebtorUserId && resolvedCreditorUserId && resolvedDebtorUserId === resolvedCreditorUserId) {
      res.status(400).json({ success: false, message: "Debtor and creditor cannot be the same person." });
      return;
    }
    if (
      !resolvedDebtorUserId
      && !resolvedCreditorUserId
      && resolvedDebtorName.toLowerCase() === resolvedCreditorName.toLowerCase()
    ) {
      res.status(400).json({ success: false, message: "Debtor and creditor cannot be the same." });
      return;
    }

    const result = await query(
      `INSERT INTO khata_entries (
         chat_id, created_by, debtor_name, debtor_user_id,
         creditor_user_id, creditor_name, amount, note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        chatId,
        createdBy,
        resolvedDebtorName,
        resolvedDebtorUserId,
        resolvedCreditorUserId,
        resolvedCreditorName,
        parsedAmount,
        note?.trim() || null,
      ],
    );

    const entry = result.rows[0] as KhataRow;

    let reminderScheduledId: number | null = null;
    if (enableReminder && reminderAt) {
      const reminderDate = new Date(reminderAt);
      if (Number.isNaN(reminderDate.getTime()) || reminderDate.getTime() <= Date.now()) {
        res.status(400).json({ success: false, message: "Reminder must be a future date." });
        return;
      }
      const reminderContent = buildKhataReminderMessage({
        debtorName: resolvedDebtorName,
        creditorName: resolvedCreditorName,
        amount: parsedAmount,
        note: note?.trim() || null,
        reminderDateLabel: formatKhataReminderDateLabel(reminderDate),
      });
      const scheduled = await query(
        `INSERT INTO scheduled_messages (
           chat_id, sender_id, content, type, scheduled_at, bypass_block, khata_entry_id
         ) VALUES ($1,$2,$3,'text',$4,TRUE,$5) RETURNING id`,
        [chatId, createdBy, reminderContent, reminderDate.toISOString(), entry.id],
      );
      reminderScheduledId = Number((scheduled.rows[0] as { id: number }).id);
      await query(
        `UPDATE khata_entries SET reminder_at = $2, reminder_scheduled_id = $3 WHERE id = $1`,
        [entry.id, reminderDate.toISOString(), reminderScheduledId],
      );
      entry.reminder_at = reminderDate.toISOString();
      entry.reminder_scheduled_id = reminderScheduledId;
    }

    const msgContent = `📒 Khata: ${resolvedDebtorName} owes ${resolvedCreditorName} ₹${parsedAmount.toFixed(2)}${note?.trim() ? ` — ${note.trim()}` : ""}`;
    await query(
      `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')`,
      [chatId, createdBy, msgContent],
    );

    res.json({ success: true, entry, reminderScheduled: Boolean(reminderScheduledId) });
  } catch (err) {
    req.log.error({ err }, "add khata error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/:id/pay", async (req: Request, res: Response) => {
  const entryId = Number(req.params.id);
  const { paidBy } = req.body as { paidBy?: number };
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  const payerId = paidBy ?? authUserId;
  if (!assertSameUser(req, res, payerId)) return;

  try {
    await ensureKhataTables();
    const existing = await query(`SELECT * FROM khata_entries WHERE id = $1`, [entryId]);
    const row = existing.rows[0] as KhataRow | undefined;
    if (!row) {
      res.status(404).json({ success: false, message: "Entry not found" });
      return;
    }
    const access = await assertChatMember(row.chat_id, payerId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }

    const result = await query(
      `UPDATE khata_entries SET paid = TRUE, paid_at = NOW(), paid_by_user_id = $2 WHERE id = $1 RETURNING *`,
      [entryId, payerId],
    );
    const entry = result.rows[0] as KhataRow;
    if (entry.reminder_scheduled_id) {
      await query(
        `DELETE FROM scheduled_messages WHERE id = $1 AND sent = FALSE`,
        [entry.reminder_scheduled_id],
      );
      await query(
        `UPDATE khata_entries SET reminder_sent = TRUE WHERE id = $1`,
        [entryId],
      );
    }
    const debtor = displayDebtor(entry);
    const creditor = displayCreditor(entry);
    const payerName = await getUserDisplayName(payerId);
    await query(
      `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')`,
      [
        entry.chat_id,
        payerId,
        `✅ Khata cleared: ${payerName} marked ₹${Number(entry.amount).toFixed(2)} paid (${debtor} → ${creditor})`,
      ],
    );
    res.json({ success: true, entry });
  } catch (err) {
    req.log.error({ err }, "pay khata error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  const entryId = Number(req.params.id);
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Sign in required." });
    return;
  }
  try {
    await ensureKhataTables();
    const existing = await query(`SELECT chat_id, created_by FROM khata_entries WHERE id = $1`, [entryId]);
    const row = existing.rows[0] as { chat_id: number; created_by: number } | undefined;
    if (!row) {
      res.status(404).json({ success: false, message: "Entry not found" });
      return;
    }
    const access = await assertChatMember(row.chat_id, userId);
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message });
      return;
    }
    if (row.created_by !== userId) {
      res.status(403).json({ success: false, message: "Only the creator can delete this entry." });
      return;
    }
    await query("DELETE FROM khata_entries WHERE id = $1", [entryId]);
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "delete khata error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
