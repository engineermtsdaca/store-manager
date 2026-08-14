-- Add INSERT policy for inventory_logs
CREATE POLICY "inv_logs_insert" ON inventory_logs FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    (auth_user_profile()).role IN ('whole_manager','ceo','finance','purchaser', 'storekeeper', 'engineer')
  )
);
