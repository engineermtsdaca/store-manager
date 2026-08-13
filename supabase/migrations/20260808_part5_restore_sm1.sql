-- ============================================================
-- PART 5: RESTORE SITE MANAGER (SM1)
-- Reverts the accidental conversion of SM1 to whole_manager
-- and restores their update access to Purchase Orders.
-- ============================================================

-- 1. Restore SM1's role back to 'manager' (Site Manager)
UPDATE public.user_profiles 
SET role = 'manager' 
WHERE LOWER(username) = 'sm1';

-- 2. Restore 'manager' to the purchase_orders update policy
-- so SM1 can approve the proforma attached by PUR1
DROP POLICY IF EXISTS "po_update_workflow" ON purchase_orders;
CREATE POLICY "po_update_workflow" ON purchase_orders FOR UPDATE
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','purchaser','payer','finance','purchase_assistant')
    OR ((auth_user_profile()).role IN ('engineer','storekeeper','manager') AND site_id = (auth_user_profile()).site_id)
  );

-- 3. Also restore 'manager' to inventory_items update/insert just in case
-- SM1 needs to manage inventory for their site
DROP POLICY IF EXISTS "inventory_storekeeper_write" ON inventory_items;
CREATE POLICY "inventory_storekeeper_write" ON inventory_items FOR UPDATE
  USING (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer', 'manager')
  );

DROP POLICY IF EXISTS "inventory_storekeeper_insert" ON inventory_items;
CREATE POLICY "inventory_storekeeper_insert" ON inventory_items FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
    AND (auth_user_profile()).role IN ('storekeeper', 'engineer', 'manager')
  );
