-- Khata auto-reminder: scheduled polite message on a chosen date (bypasses chat block for delivery).
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ;
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE khata_entries ADD COLUMN IF NOT EXISTS reminder_scheduled_id INTEGER;

ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS khata_entry_id INTEGER REFERENCES khata_entries(id) ON DELETE CASCADE;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS bypass_block BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_khata_entries_reminder_due ON khata_entries (reminder_at) WHERE reminder_sent = FALSE AND paid = FALSE;
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_khata ON scheduled_messages (khata_entry_id) WHERE khata_entry_id IS NOT NULL;
