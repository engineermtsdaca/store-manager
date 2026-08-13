-- ==========================================================
-- FIX: HIGH-03 Supabase Anon Key Exposed in Client-Side Code
-- Adds missing RLS policies to completely lock down the DB
-- ==========================================================

-- 1. workers table RLS
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- Allow reading workers in the same site, or globally for privileged roles
DROP POLICY IF EXISTS "workers_read" ON workers;
CREATE POLICY "workers_read" ON workers FOR SELECT
  USING (
    (auth_user_profile()).role IN ('manager','coordinator','ceo','finance','whole_manager')
    OR site_id = (auth_user_profile()).site_id
  );

-- Allow creating workers (used by PUT /api/attendance)
DROP POLICY IF EXISTS "workers_insert" ON workers;
CREATE POLICY "workers_insert" ON workers FOR INSERT
  WITH CHECK (
    (auth_user_profile()).role IN ('manager','engineer','finance','whole_manager')
    AND site_id = (auth_user_profile()).site_id
  );

-- Allow updating workers
DROP POLICY IF EXISTS "workers_update" ON workers;
CREATE POLICY "workers_update" ON workers FOR UPDATE
  USING (
    (auth_user_profile()).role IN ('manager','engineer','finance','whole_manager')
    AND site_id = (auth_user_profile()).site_id
  );

-- 2. Fix attendance_records RLS
-- Upserts require BOTH INSERT and UPDATE permissions!
DROP POLICY IF EXISTS "attendance_insert_sk" ON attendance_records;
DROP POLICY IF EXISTS "attendance_insert" ON attendance_records;

CREATE POLICY "attendance_insert" ON attendance_records FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer', 'manager')
  );

DROP POLICY IF EXISTS "attendance_update" ON attendance_records;
CREATE POLICY "attendance_update" ON attendance_records FOR UPDATE
  USING (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer', 'manager')
  );

-- 3. action_receipts RLS
ALTER TABLE action_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_receipts_read" ON action_receipts;
CREATE POLICY "action_receipts_read" ON action_receipts FOR SELECT
  USING (
    (auth_user_profile()).role IN ('manager','coordinator','ceo','finance','purchaser','purchase_assistant','whole_manager')
    OR site_id = (auth_user_profile()).site_id
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "action_receipts_insert" ON action_receipts;
CREATE POLICY "action_receipts_insert" ON action_receipts FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND (site_id = (auth_user_profile()).site_id OR (auth_user_profile()).site_id IS NULL)
  );

-- 4. No DELETE Policies are defined. 
-- By enabling RLS and explicitly omitting DELETE policies, PostgreSQL automatically DENIES all DELETE queries.
-- This ensures that nobody (except service_role) can delete data via the anon key!
