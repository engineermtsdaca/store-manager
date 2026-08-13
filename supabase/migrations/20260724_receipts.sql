CREATE TABLE IF NOT EXISTS action_receipts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number TEXT UNIQUE NOT NULL,
  action_type   TEXT NOT NULL,
  details       JSONB NOT NULL,
  site_id       UUID REFERENCES sites(id),
  user_id       UUID REFERENCES user_profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE action_receipts ENABLE ROW LEVEL SECURITY;

-- Policy for Storekeeper, Engineer, Foreman (Site-level access)
DROP POLICY IF EXISTS "action_receipts_site_read" ON action_receipts;
CREATE POLICY "action_receipts_site_read" ON action_receipts FOR SELECT
  USING (
    site_id = (auth_user_profile()).site_id
    OR user_id = auth.uid()
  );

-- Policy for Manager, CEO, Coordinator (Global access)
DROP POLICY IF EXISTS "action_receipts_global_read" ON action_receipts;
CREATE POLICY "action_receipts_global_read" ON action_receipts FOR SELECT
  USING (
    (auth_user_profile()).role IN ('manager', 'ceo', 'coordinator')
  );

-- Policy for Finance (Finance-related actions only + site-less)
DROP POLICY IF EXISTS "action_receipts_finance_read" ON action_receipts;
CREATE POLICY "action_receipts_finance_read" ON action_receipts FOR SELECT
  USING (
    (auth_user_profile()).role = 'finance'
    AND (
      action_type IN ('Petty Cash Replenishment', 'Petty Cash Expense', 'PO Release Payment', 'Transfer Verification')
      OR site_id IS NULL
    )
  );

DROP POLICY IF EXISTS "action_receipts_insert" ON action_receipts;
CREATE POLICY "action_receipts_insert" ON action_receipts FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );
