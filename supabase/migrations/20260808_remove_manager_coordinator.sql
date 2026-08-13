-- ============================================================
-- MIGRATION: Remove 'manager' and 'coordinator' roles
-- FIXED v5: Keep the old enum values in the database, but migrate the data.
-- Since PostgreSQL makes it extremely difficult to drop enum values used in RLS policies,
-- the safest approach is to migrate the data and just stop using the old values.
-- The frontend and backend codebase has already removed them, so they cannot be assigned again.
-- ============================================================

-- ============================================================
-- STEP 1: Add new values to enums (if they don't exist yet)
-- ============================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'whole_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'purchase_assistant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'maintenance';

ALTER TYPE transfer_status ADD VALUE IF NOT EXISTS 'pending_whole_manager';

-- ============================================================
-- STEP 2: Migrate existing data to the new values
-- ============================================================

-- A. Migrate user roles
UPDATE user_profiles SET role = 'whole_manager' WHERE role = 'manager';
UPDATE user_profiles SET role = 'ceo'           WHERE role = 'coordinator';

-- B. Migrate transfer records
UPDATE material_transfers SET status = 'pending_whole_manager' WHERE status = 'pending_manager';

-- C. Migrate material requests
UPDATE material_requests SET status = 'ordered_pending' WHERE status = 'pending_coordinator';

-- D. Migrate purchase orders (using new workflow statuses from DB)
-- If there are any old POs with pending_manager/pending_coordinator, move them to pending_ceo
UPDATE purchase_orders SET status = 'pending_ceo' WHERE status = 'pending_manager' OR status = 'pending_coordinator';

-- ============================================================
-- Note: We are deliberately NOT dropping the 'manager' and 'coordinator' 
-- values from the ENUMs, as they are referenced by multiple RLS policies. 
-- Leaving them in the ENUM is harmless since the application logic 
-- will no longer use or insert them.
-- ============================================================
