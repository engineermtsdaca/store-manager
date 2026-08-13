-- ============================================================
-- PART 4 (FIXED): DELETE MGR1, CD1, CD2 ACCOUNTS (CASE-INSENSITIVE)
-- ============================================================

-- 1. Create a temporary table to hold the IDs of the users we want to delete
CREATE TEMP TABLE old_users_to_delete AS
SELECT id FROM public.user_profiles 
WHERE LOWER(username) IN ('mgr1', 'cd1', 'cd2', 'manager', 'coordinator', 'fm1');

-- 2. Unlink them from all tables that have foreign keys pointing to user_profiles(id)
UPDATE purchase_orders      SET requested_by = NULL WHERE requested_by IN (SELECT id FROM old_users_to_delete);
UPDATE po_status_history    SET changed_by = NULL   WHERE changed_by   IN (SELECT id FROM old_users_to_delete);

UPDATE material_requests    SET requested_by = NULL WHERE requested_by IN (SELECT id FROM old_users_to_delete);

UPDATE material_transfers   SET requested_by = NULL WHERE requested_by IN (SELECT id FROM old_users_to_delete);
UPDATE material_transfers   SET approved_by  = NULL WHERE approved_by  IN (SELECT id FROM old_users_to_delete);
UPDATE material_transfers   SET verified_by  = NULL WHERE verified_by  IN (SELECT id FROM old_users_to_delete);

UPDATE petty_cash_logs      SET audited_by   = NULL WHERE audited_by   IN (SELECT id FROM old_users_to_delete);
UPDATE petty_cash_logs      SET performed_by = NULL WHERE performed_by IN (SELECT id FROM old_users_to_delete);

UPDATE attendance_records   SET submitted_by = NULL WHERE submitted_by IN (SELECT id FROM old_users_to_delete);

UPDATE wastage_reports      SET reported_by  = NULL WHERE reported_by  IN (SELECT id FROM old_users_to_delete);
UPDATE wastage_reports      SET reviewed_by  = NULL WHERE reviewed_by  IN (SELECT id FROM old_users_to_delete);

UPDATE system_messages      SET recipient_user_id = NULL WHERE recipient_user_id IN (SELECT id FROM old_users_to_delete);

UPDATE inventory_logs       SET performed_by = NULL WHERE performed_by IN (SELECT id FROM old_users_to_delete);

-- Also unlink from newer tables if they exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'error_logs') THEN
    EXECUTE 'UPDATE error_logs SET reported_by = NULL WHERE reported_by IN (SELECT id FROM old_users_to_delete)';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'action_receipts') THEN
    EXECUTE 'UPDATE action_receipts SET user_id = NULL WHERE user_id IN (SELECT id FROM old_users_to_delete)';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename  = 'telegram_users') THEN
    EXECUTE 'UPDATE telegram_users SET user_id = NULL WHERE user_id IN (SELECT id FROM old_users_to_delete)';
  END IF;
END $$;

-- 3. Delete from public.user_profiles
DELETE FROM public.user_profiles 
WHERE id IN (SELECT id FROM old_users_to_delete);

-- 4. Delete from auth.users (Supabase authentication)
DELETE FROM auth.users 
WHERE id IN (SELECT id FROM old_users_to_delete);

-- Clean up
DROP TABLE old_users_to_delete;
