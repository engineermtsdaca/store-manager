-- ============================================================
-- PART 2: MIGRATE DATA
-- IMPORTANT: Only run this AFTER running PART 1.
-- ============================================================

-- A. Migrate user roles
UPDATE user_profiles SET role = 'whole_manager' WHERE role = 'manager';
UPDATE user_profiles SET role = 'ceo'           WHERE role = 'coordinator';

-- B. Migrate transfer records
UPDATE material_transfers SET status = 'pending_whole_manager' WHERE status = 'pending_manager';

-- C. Migrate material requests
UPDATE material_requests SET status = 'ordered_pending' WHERE status = 'pending_coordinator';

-- D. Migrate purchase orders 
UPDATE purchase_orders SET status = 'pending_ceo' WHERE status = 'pending_manager' OR status = 'pending_coordinator';
