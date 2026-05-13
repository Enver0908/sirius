ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS shopify_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS shopify_access_token_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS shopify_refresh_token_expires_at TIMESTAMP;
