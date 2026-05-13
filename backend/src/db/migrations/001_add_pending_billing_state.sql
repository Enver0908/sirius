BEGIN;

ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_billing_status_check;
ALTER TABLE shops ADD CONSTRAINT shops_billing_status_check
  CHECK (billing_status IN ('trial', 'pending', 'active', 'cancelled', 'frozen'));

ALTER TABLE shops ADD COLUMN IF NOT EXISTS pending_plan VARCHAR(50);
ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_pending_plan_check;
ALTER TABLE shops ADD CONSTRAINT shops_pending_plan_check
  CHECK (pending_plan IS NULL OR pending_plan IN ('platform', 'sirius'));

ALTER TABLE shops ADD COLUMN IF NOT EXISTS pending_charge_id VARCHAR(255);

COMMIT;
