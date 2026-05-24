-- Khata Phase 1: member-linked debtor/creditor + payment attribution
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS debtor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS creditor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS creditor_name TEXT;
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_khata_entries_debtor_user
  ON khata_entries (chat_id, debtor_user_id);

CREATE INDEX IF NOT EXISTS idx_khata_entries_creditor_user
  ON khata_entries (chat_id, creditor_user_id);
