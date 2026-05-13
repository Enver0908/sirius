BEGIN;

UPDATE shops
SET plan = 'sirius'
WHERE plan = 'selliguide';

UPDATE shops
SET pending_plan = 'sirius'
WHERE pending_plan = 'selliguide';

ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_plan_check;
ALTER TABLE shops ADD CONSTRAINT shops_plan_check
  CHECK (plan IN ('platform', 'sirius'));

ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_pending_plan_check;
ALTER TABLE shops ADD CONSTRAINT shops_pending_plan_check
  CHECK (pending_plan IS NULL OR pending_plan IN ('platform', 'sirius'));

CREATE TABLE IF NOT EXISTS shop_ai_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL
    CHECK (provider IN ('claude', 'gemini', 'chatgpt')),
  encrypted_api_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, provider)
);

DROP TRIGGER IF EXISTS trg_shop_ai_credentials_updated_at ON shop_ai_credentials;
CREATE TRIGGER trg_shop_ai_credentials_updated_at
  BEFORE UPDATE ON shop_ai_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'shops' AND column_name = 'ai_api_key'
  ) THEN
    INSERT INTO shop_ai_credentials (shop_id, provider, encrypted_api_key)
    SELECT id, ai_provider, ai_api_key
    FROM shops
    WHERE ai_provider IS NOT NULL AND ai_api_key IS NOT NULL
    ON CONFLICT (shop_id, provider)
    DO UPDATE SET
      encrypted_api_key = EXCLUDED.encrypted_api_key,
      updated_at = NOW();
  END IF;
END $$;

COMMIT;
