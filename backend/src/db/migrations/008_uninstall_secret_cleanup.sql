BEGIN;

ALTER TABLE shops
  ALTER COLUMN shopify_access_token DROP NOT NULL;

WITH seeded_shops AS (
  SELECT DISTINCT shop_id
  FROM shop_data_cache
  WHERE normalized_data ? 'generated_by'
     OR normalized_data ? 'last_sync_source'
)
DELETE FROM shop_data_cache c
USING seeded_shops s
WHERE c.shop_id = s.shop_id;

COMMIT;
