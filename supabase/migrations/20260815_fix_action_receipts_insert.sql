-- Ensure users can insert action_receipts (required for tracking PO history and system receipts)
DROP POLICY IF EXISTS "action_receipts_insert" ON action_receipts;
CREATE POLICY "action_receipts_insert" ON action_receipts FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
    );
