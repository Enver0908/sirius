-- Sirius Database Schema
-- PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_domain VARCHAR(255) UNIQUE NOT NULL,
  shopify_access_token TEXT,
  shopify_refresh_token TEXT,
  shopify_access_token_expires_at TIMESTAMP,
  shopify_refresh_token_expires_at TIMESTAMP,
  plan VARCHAR(50) NOT NULL DEFAULT 'sirius'
    CHECK (plan IN ('sirius')),
  ai_provider VARCHAR(50)
    CHECK (ai_provider IN ('claude', 'gemini', 'chatgpt')),
  ai_model VARCHAR(100)
    CHECK (
      ai_model IS NULL OR ai_model IN (
        'gemini-3.1-pro',
        'claude-sonnet-4.6',
        'claude-opus-4.6',
        'gpt-5.4',
        'gpt-5.5'
      )
    ),
  shopify_billing_id VARCHAR(255),
  billing_status VARCHAR(50) NOT NULL DEFAULT 'trial'
    CHECK (billing_status IN ('trial', 'pending', 'active', 'cancelled', 'frozen')),
  pending_plan VARCHAR(50)
    CHECK (pending_plan IS NULL OR pending_plan IN ('sirius')),
  pending_charge_id VARCHAR(255),
  pending_billing_nonce VARCHAR(64),
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE shop_ai_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL
    CHECK (provider IN ('claude', 'gemini', 'chatgpt')),
  encrypted_api_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, provider)
);

CREATE TRIGGER trg_shop_ai_credentials_updated_at
  BEFORE UPDATE ON shop_ai_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_shop_ai_credentials_shop_id ON shop_ai_credentials(shop_id);
CREATE INDEX idx_shop_ai_credentials_provider ON shop_ai_credentials(shop_id, provider);

CREATE TABLE skill_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  skill_name VARCHAR(100) NOT NULL,
  skill_content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version VARCHAR(20) NOT NULL DEFAULT 'v1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, skill_name)
);

CREATE INDEX idx_skill_assignments_shop_id ON skill_assignments(shop_id);
CREATE INDEX idx_skill_assignments_active ON skill_assignments(shop_id, is_active)
  WHERE is_active = true;

CREATE TABLE shop_data_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  data_type VARCHAR(100) NOT NULL,
  raw_data JSONB,
  normalized_data JSONB,
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE (shop_id, data_type)
);

CREATE INDEX idx_shop_data_cache_shop_id ON shop_data_cache(shop_id);
CREATE INDEX idx_shop_data_cache_expires ON shop_data_cache(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills_used TEXT[] DEFAULT '{}',
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_conversations_shop_id ON conversations(shop_id);
CREATE INDEX idx_conversations_created_at ON conversations(shop_id, created_at DESC);

CREATE TABLE conversation_attachments (
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

CREATE TRIGGER trg_conversation_attachments_updated_at
  BEFORE UPDATE ON conversation_attachments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_conversation_attachments_shop_id
  ON conversation_attachments(shop_id, created_at DESC);
CREATE INDEX idx_conversation_attachments_conversation_id
  ON conversation_attachments(conversation_id, message_index);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority_score INTEGER CHECK (priority_score BETWEEN 0 AND 100),
  confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  source_skill VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_tasks_shop_id ON tasks(shop_id);
CREATE INDEX idx_tasks_status ON tasks(shop_id, status)
  WHERE status != 'done';
CREATE INDEX idx_tasks_priority ON tasks(shop_id, priority_score DESC)
  WHERE status = 'pending';

CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  ai_provider VARCHAR(50) NOT NULL
    CHECK (ai_provider IN ('claude', 'gemini', 'chatgpt')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  skills_used TEXT[] DEFAULT '{}',
  prompt_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  finish_reason VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_token_usage_shop_id ON token_usage(shop_id);
CREATE INDEX idx_token_usage_created_at ON token_usage(shop_id, created_at DESC);
CREATE INDEX idx_token_usage_provider ON token_usage(shop_id, ai_provider);
