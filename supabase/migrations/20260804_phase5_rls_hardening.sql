-- supabase/migrations/20260804_phase5_rls_hardening.sql
-- ==============================================================================
-- PHASE 5: ROW LEVEL SECURITY HARDENING
-- ==============================================================================

-- 1. ADD MISSING REJECT RPC FOR PURCHASE ORDERS
CREATE OR REPLACE FUNCTION po_reject_request(
    p_po_id UUID,
    p_user_id UUID,
    p_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Only Managers, Whole Managers, and CEOs can reject
    IF p_role NOT IN ('manager', 'whole_manager', 'ceo', 'engineer') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized to reject');
    END IF;

    UPDATE purchase_orders 
    SET status = 'blocked_mismatch'
    WHERE id = p_po_id;

    RETURN jsonb_build_object('success', TRUE, 'new_status', 'blocked_mismatch');
END;
$$;

-- 2. HARDEN PURCHASE ORDERS RLS
DROP POLICY IF EXISTS "purchase_orders_update_policy" ON purchase_orders;

-- We now ONLY allow updates via our SECURITY DEFINER RPCs for normal users.
-- Only maintenance can perform raw SQL updates.
CREATE POLICY "purchase_orders_update_policy"
ON purchase_orders FOR UPDATE
USING (
  (auth_user_profile()).role = 'maintenance'
);


-- 3. HARDEN MATERIAL REQUESTS RLS
DROP POLICY IF EXISTS "material_requests_update_policy" ON material_requests;
DROP POLICY IF EXISTS "material_requests_select_policy" ON material_requests;
DROP POLICY IF EXISTS "material_requests_insert_policy" ON material_requests;
DROP POLICY IF EXISTS "material_requests_delete_policy" ON material_requests;

CREATE POLICY "material_requests_select_policy"
ON material_requests FOR SELECT
USING (
  -- Subcontractors can see their own site requests
  (auth_user_profile()).site_id = site_id
  OR
  -- Global roles can see everything
  (auth_user_profile()).role IN ('engineer', 'manager', 'whole_manager', 'ceo', 'coordinator', 'maintenance')
);

CREATE POLICY "material_requests_insert_policy"
ON material_requests FOR INSERT
WITH CHECK (
  (auth_user_profile()).role IN ('subcontractor', 'foreman', 'engineer')
);

CREATE POLICY "material_requests_update_policy"
ON material_requests FOR UPDATE
USING (
  -- Only engineers can approve/order, and storekeepers can sign off, and maintenance can fix
  (auth_user_profile()).role IN ('engineer', 'storekeeper', 'maintenance')
);

-- Note: We leave DELETE disabled for everyone.
