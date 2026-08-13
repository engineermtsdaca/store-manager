-- ============================================================
-- COMPLETELY REMOVE FOREMAN ROLE & RENAME ENUM
-- ============================================================

-- 1. Reassign any existing Foreman users to Subcontractor
UPDATE user_profiles 
SET role = 'subcontractor'
WHERE role = 'foreman';

-- 2. Rename the enum value 'pending_foreman' to 'delivered' in material_request_status
ALTER TYPE material_request_status RENAME VALUE 'pending_foreman' TO 'delivered';

-- 3. Redefine po_receive_goods RPC to use 'delivered' instead of 'pending_foreman'
CREATE OR REPLACE FUNCTION po_receive_goods(p_po_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po purchase_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF v_po.status != 'shipped' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PO not shipped yet');
    END IF;

    -- Update PO
    UPDATE purchase_orders 
    SET status = 'sk_received', sk_received_at = NOW()
    WHERE id = p_po_id;

    -- Update Inventory (add to received and bought)
    UPDATE inventory_items
    SET received = received + v_po.qty,
        bought = bought + v_po.qty
    WHERE name = v_po.item AND site_id = v_po.site_id;

    -- If this was tied to a subcontractor request, update that request
    IF v_po.from_sc_request = TRUE AND v_po.sc_request_id IS NOT NULL THEN
        UPDATE material_requests
        SET status = 'delivered'
        WHERE id = v_po.sc_request_id::UUID;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'new_status', 'sk_received');
END;
$$;
