-- WhatsApp-style template components (header media/text, footer, buttons, preview samples)
ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS header_text TEXT;
ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS header_media_url TEXT;
ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS buttons_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS variable_samples_json JSONB NOT NULL DEFAULT '{}';
