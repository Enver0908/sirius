UPDATE shops
SET plan = 'sirius'
WHERE plan = 'platform';

UPDATE shops
SET pending_plan = 'sirius'
WHERE pending_plan = 'platform';

ALTER TABLE shops
  ALTER COLUMN plan SET DEFAULT 'sirius';

ALTER TABLE shops
  DROP CONSTRAINT IF EXISTS shops_plan_check;

ALTER TABLE shops
  ADD CONSTRAINT shops_plan_check
  CHECK (plan IN ('sirius'));

ALTER TABLE shops
  DROP CONSTRAINT IF EXISTS shops_pending_plan_check;

ALTER TABLE shops
  ADD CONSTRAINT shops_pending_plan_check
  CHECK (pending_plan IS NULL OR pending_plan IN ('sirius'));
