BEGIN;

-- One-time safe cleanup for the development review store. This removes old
-- AI test traces without deleting the Shopify installation row itself.
WITH target_shops AS (
  SELECT id
  FROM shops
  WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com')
)
DELETE FROM conversation_attachments ca
USING target_shops ts
WHERE ca.shop_id = ts.id;

WITH target_shops AS (
  SELECT id
  FROM shops
  WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com')
)
DELETE FROM conversations c
USING target_shops ts
WHERE c.shop_id = ts.id;

WITH target_shops AS (
  SELECT id
  FROM shops
  WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com')
)
DELETE FROM tasks t
USING target_shops ts
WHERE t.shop_id = ts.id;

WITH target_shops AS (
  SELECT id
  FROM shops
  WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com')
)
DELETE FROM token_usage tu
USING target_shops ts
WHERE tu.shop_id = ts.id;

WITH target_shops AS (
  SELECT id
  FROM shops
  WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com')
)
DELETE FROM shop_data_cache c
USING target_shops ts
WHERE c.shop_id = ts.id;

WITH target_shops AS (
  SELECT id
  FROM shops
  WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com')
)
DELETE FROM shop_ai_credentials ac
USING target_shops ts
WHERE ac.shop_id = ts.id;

UPDATE shops
SET ai_provider = NULL,
    ai_model = NULL,
    updated_at = NOW()
WHERE shopify_domain IN ('sirius-se8mmhcq.myshopify.com', 'sirius-axtjwx5a.myshopify.com');

COMMIT;
