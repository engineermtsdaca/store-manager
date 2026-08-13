-- ============================================================
-- PART 1: ADD ENUM VALUES
-- IMPORTANT: Run this file entirely first, wait for success,
-- then run PART 2. PostgreSQL requires these to be committed
-- before they can be used in UPDATE statements.
-- ============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'whole_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'purchase_assistant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'maintenance';

ALTER TYPE transfer_status ADD VALUE IF NOT EXISTS 'pending_whole_manager';
