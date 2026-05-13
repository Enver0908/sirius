CREATE TABLE IF NOT EXISTS conversation_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  message_index INTEGER,
  original_name TEXT NOT NULL,
  file_ext VARCHAR(20) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  attachment_kind VARCHAR(20) NOT NULL
    CHECK (attachment_kind IN ('image', 'pdf', 'csv', 'docx', 'text', 'zip')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL,
  extracted_text TEXT,
  structured_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status VARCHAR(20) NOT NULL DEFAULT 'ready'
    CHECK (processing_status IN ('ready', 'failed')),
  processing_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (
    (conversation_id IS NULL AND message_index IS NULL)
    OR (conversation_id IS NOT NULL AND message_index IS NOT NULL AND message_index >= 0)
  )
);

DROP TRIGGER IF EXISTS trg_conversation_attachments_updated_at ON conversation_attachments;
CREATE TRIGGER trg_conversation_attachments_updated_at
  BEFORE UPDATE ON conversation_attachments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_conversation_attachments_shop_id
  ON conversation_attachments(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_attachments_conversation_id
  ON conversation_attachments(conversation_id, message_index);
