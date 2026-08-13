-- =============================================================================
-- FIX ROW LEVEL SECURITY (RLS) FOR PURCHASE ORDERS
-- This ensures that Whole Managers, Purchase Assistants, Payers, and CEOs
-- can read and update purchase orders properly.
-- Run this in the Supabase Dashboard -> SQL Editor
-- =============================================================================

-- 1. Drop existing read/update policies (if any) to prevent conflicts
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_select_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert_policy" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete_policy" ON purchase_orders;
DROP POLICY IF EXISTS "PO read access" ON purchase_orders;
DROP POLICY IF EXISTS "PO update access" ON purchase_orders;
DROP POLICY IF EXISTS "PO insert access" ON purchase_orders;
DROP POLICY IF EXISTS "Manager global read" ON purchase_orders;
DROP POLICY IF EXISTS "Engineer site read" ON purchase_orders;

-- 2. Create a comprehensive SELECT policy
CREATE POLICY "purchase_orders_select_policy"
ON purchase_orders FOR SELECT
USING (
  -- Global roles can see ALL purchase orders
  (auth_user_profile()).role IN (
    'manager', 
    'whole_manager', 
    'ceo', 
    'purchase_assistant', 
    'payer', 
    'finance', 
    'purchaser', 
    'coordinator'
  )
  OR 
  -- Site-specific roles can see purchase orders for their site
  site_id = (auth_user_profile()).site_id
);

-- 3. Create a comprehensive UPDATE policy
CREATE POLICY "purchase_orders_update_policy"
ON purchase_orders FOR UPDATE
USING (
  (auth_user_profile()).role IN (
    'manager', 
    'whole_manager', 
    'ceo', 
    'purchase_assistant', 
    'payer', 
    'finance', 
    'purchaser', 
    'coordinator',
    'engineer',
    'storekeeper'
  )
);

-- 4. Create an INSERT policy
CREATE POLICY "purchase_orders_insert_policy"
ON purchase_orders FOR INSERT
WITH CHECK (
  (auth_user_profile()).role IN (
    'engineer', 
    'storekeeper', 
    'manager', 
    'purchaser',
    'ceo'
  )
);

-- Note: Ensure purchase_orders has RLS enabled
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
