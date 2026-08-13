-- ==========================================================
-- FIX: MED-06 The petty_cash_accounts Table Lacks Proper Read RLS Policy
-- ==========================================================

ALTER TABLE petty_cash_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_accounts_read" ON petty_cash_accounts;
CREATE POLICY "petty_cash_accounts_read" ON petty_cash_accounts FOR SELECT
  USING (
    (auth_user_profile()).role IN ('manager','coordinator','ceo','finance','payer','whole_manager')
    OR site_id = (auth_user_profile()).site_id
  );
