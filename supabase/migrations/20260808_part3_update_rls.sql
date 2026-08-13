-- ============================================================
-- PART 3: UPDATE RLS POLICIES
-- This will fix the security compromise by granting 'whole_manager'
-- and 'ceo' the access that used to belong to 'manager'/'coordinator'.
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. user_profiles
DROP POLICY IF EXISTS "profiles_own" ON user_profiles;
CREATE POLICY "profiles_own" ON user_profiles FOR SELECT USING (TRUE);

-- 2. inventory_items
DROP POLICY IF EXISTS "inventory_site_read" ON inventory_items;
CREATE POLICY "inventory_site_read" ON inventory_items FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance','purchaser')
    OR site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "inventory_storekeeper_write" ON inventory_items;
CREATE POLICY "inventory_storekeeper_write" ON inventory_items FOR UPDATE
  USING (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer')
  );

DROP POLICY IF EXISTS "inventory_storekeeper_insert" ON inventory_items;
CREATE POLICY "inventory_storekeeper_insert" ON inventory_items FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer')
  );

-- 3. purchase_orders
DROP POLICY IF EXISTS "po_read" ON purchase_orders;
CREATE POLICY "po_read" ON purchase_orders FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','purchaser','payer','finance','purchase_assistant')
    OR site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "po_insert_engineer" ON purchase_orders;
CREATE POLICY "po_insert_engineer" ON purchase_orders FOR INSERT
  WITH CHECK (
    (auth_user_profile()).role IN ('engineer','storekeeper')
    AND site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "po_update_workflow" ON purchase_orders;
CREATE POLICY "po_update_workflow" ON purchase_orders FOR UPDATE
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','purchaser','payer','finance','purchase_assistant')
    OR ((auth_user_profile()).role IN ('engineer','storekeeper') AND site_id = (auth_user_profile()).site_id)
  );

-- 4. petty_cash_logs
DROP POLICY IF EXISTS "petty_cash_logs_read" ON petty_cash_logs;
CREATE POLICY "petty_cash_logs_read" ON petty_cash_logs FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance','payer')
    OR site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "petty_cash_logs_insert_sk" ON petty_cash_logs;
CREATE POLICY "petty_cash_logs_insert_sk" ON petty_cash_logs FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role = 'storekeeper'
  );

-- 5. material_transfers
DROP POLICY IF EXISTS "transfers_read" ON material_transfers;
CREATE POLICY "transfers_read" ON material_transfers FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance')
    OR source_site_id = (auth_user_profile()).site_id
    OR dest_site_id   = (auth_user_profile()).site_id
  );

-- 6. system_messages
DROP POLICY IF EXISTS "messages_read" ON system_messages;
CREATE POLICY "messages_read" ON system_messages FOR SELECT
  USING (
    recipient_role = (auth_user_profile()).role
    AND (recipient_company IS NULL OR recipient_company = (auth_user_profile()).company)
    AND (recipient_site_id IS NULL OR recipient_site_id = (auth_user_profile()).site_id)
    AND (recipient_user_id IS NULL OR recipient_user_id = auth.uid())
  );

-- 7. attendance_records
DROP POLICY IF EXISTS "attendance_read" ON attendance_records;
CREATE POLICY "attendance_read" ON attendance_records FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo')
    OR site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "attendance_insert_sk" ON attendance_records;
DROP POLICY IF EXISTS "attendance_insert" ON attendance_records;
CREATE POLICY "attendance_insert" ON attendance_records FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer', 'whole_manager')
  );

DROP POLICY IF EXISTS "attendance_update" ON attendance_records;
CREATE POLICY "attendance_update" ON attendance_records FOR UPDATE
  USING (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer', 'whole_manager')
  );

-- 8. wastage_reports
DROP POLICY IF EXISTS "wastage_read" ON wastage_reports;
CREATE POLICY "wastage_read" ON wastage_reports FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo')
    OR site_id = (auth_user_profile()).site_id
  );

-- 9. inventory_logs
DROP POLICY IF EXISTS "inv_logs_read" ON inventory_logs;
CREATE POLICY "inv_logs_read" ON inventory_logs FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance')
    OR site_id = (auth_user_profile()).site_id
  );

-- 10. action_receipts
DROP POLICY IF EXISTS "action_receipts_global_read" ON action_receipts;
CREATE POLICY "action_receipts_global_read" ON action_receipts FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager', 'ceo')
  );

DROP POLICY IF EXISTS "action_receipts_read" ON action_receipts;
CREATE POLICY "action_receipts_read" ON action_receipts FOR SELECT
  USING (
    (auth_user_profile()).role IN ('ceo','finance','purchaser','purchase_assistant','whole_manager')
    OR site_id = (auth_user_profile()).site_id
    OR user_id = auth.uid()
  );

-- 11. workers
DROP POLICY IF EXISTS "workers_read" ON workers;
CREATE POLICY "workers_read" ON workers FOR SELECT
  USING (
    (auth_user_profile()).role IN ('ceo','finance','whole_manager')
    OR site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "workers_insert" ON workers;
CREATE POLICY "workers_insert" ON workers FOR INSERT
  WITH CHECK (
    (auth_user_profile()).role IN ('engineer','finance','whole_manager')
    AND site_id = (auth_user_profile()).site_id
  );

DROP POLICY IF EXISTS "workers_update" ON workers;
CREATE POLICY "workers_update" ON workers FOR UPDATE
  USING (
    (auth_user_profile()).role IN ('engineer','finance','whole_manager')
    AND site_id = (auth_user_profile()).site_id
  );
