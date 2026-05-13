ALTER TABLE shops
ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);

UPDATE shops
SET ai_model = CASE ai_provider
  WHEN 'claude' THEN 'claude-opus-4.6'
  WHEN 'chatgpt' THEN 'gpt-5.4'
  WHEN 'gemini' THEN 'gemini-3.1-pro'
  ELSE ai_model
END
WHERE ai_model IS NULL;

ALTER TABLE shops
DROP CONSTRAINT IF EXISTS shops_ai_model_check;

ALTER TABLE shops
ADD CONSTRAINT shops_ai_model_check
CHECK (
  ai_model IS NULL OR ai_model IN (
    'gemini-3.1-pro',
    'claude-sonnet-4.6',
    'claude-opus-4.6',
    'gpt-5.4',
    'gpt-5.5'
  )
);
