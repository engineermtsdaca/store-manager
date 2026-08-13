-- supabase/migrations/20260804_phase2_po_rpcs.sql
-- ==============================================================================
-- PHASE 2: PURCHASE ORDER BACKEND LOGIC (RPCs)
-- These atomic functions enforce security, correct state transitions, and role checks.
-- ==============================================================================

-- 1. AUTHORIZE REQUEST (Manager -> Whole Manager -> CEO)
CREATE OR REPLACE FUNCTION po_authorize_request(
    p_po_id UUID,
    p_user_id UUID,
    p_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po purchase_orders%ROWTYPE;
    v_next_status po_status;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', FALSE, 'error', 'PO not found'); END IF;

    IF p_role = 'manager' AND v_po.status = 'pending_site_manager_req' THEN
        v_next_status := 'pending_whole_manager_req';
    ELSIF p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_req' THEN
        v_next_status := 'pending_ceo_req';
    ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_req' THEN
        v_next_status := 'pending_purchaser_proforma';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid role or PO status for request authorization');
    END IF;

    UPDATE purchase_orders 
    SET status = v_next_status, req_approved_at = NOW() 
    WHERE id = p_po_id;

    RETURN jsonb_build_object('success', TRUE, 'new_status', v_next_status);
END;
$$;

-- 2. ATTACH PROFORMA (Purchaser)
CREATE OR REPLACE FUNCTION po_attach_proforma(
    p_po_id UUID,
    p_user_id UUID,
    p_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po purchase_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    
    IF v_po.status != 'pending_purchaser_proforma' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PO is not waiting for proforma');
    END IF;

    UPDATE purchase_orders 
    SET status = 'pending_site_manager_prof', proforma_attached = TRUE, proforma_url = p_url, prof_attached_at = NOW()
    WHERE id = p_po_id;

    RETURN jsonb_build_object('success', TRUE, 'new_status', 'pending_site_manager_prof');
END;
$$;

-- 3. APPROVE PROFORMA (Manager -> Whole Manager -> CEO)
CREATE OR REPLACE FUNCTION po_approve_proforma(
    p_po_id UUID,
    p_user_id UUID,
    p_role user_role,
    p_reject BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po purchase_orders%ROWTYPE;
    v_next_status po_status;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF p_reject THEN
        -- Any rejection at this stage sends it back to purchaser
        UPDATE purchase_orders SET status = 'pending_purchaser_proforma' WHERE id = p_po_id;
        RETURN jsonb_build_object('success', TRUE, 'new_status', 'pending_purchaser_proforma');
    END IF;

    IF p_role = 'manager' AND v_po.status = 'pending_site_manager_prof' THEN
        v_next_status := 'pending_whole_manager_prof';
    ELSIF p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_prof' THEN
        v_next_status := 'pending_ceo_prof';
    ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_prof' THEN
        v_next_status := 'pending_pa_formal_paper';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid role or PO status for proforma approval');
    END IF;

    UPDATE purchase_orders 
    SET status = v_next_status, prof_approved_at = NOW() 
    WHERE id = p_po_id;

    RETURN jsonb_build_object('success', TRUE, 'new_status', v_next_status);
END;
$$;

-- 4. SIGN FORMAL PAPER (PA -> Purchaser -> CEO)
CREATE OR REPLACE FUNCTION po_sign_formal_paper(
    p_po_id UUID,
    p_user_id UUID,
    p_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po purchase_orders%ROWTYPE;
    v_next_status po_status;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF p_role = 'purchase_assistant' AND v_po.status = 'pending_pa_formal_paper' THEN
        UPDATE purchase_orders SET status = 'pending_purchaser_sign', pa_signed = TRUE, pa_signed_at = NOW() WHERE id = p_po_id;
        v_next_status := 'pending_purchaser_sign';
        
    ELSIF p_role = 'purchaser' AND v_po.status = 'pending_purchaser_sign' THEN
        UPDATE purchase_orders SET status = 'pending_ceo_formal_paper', purchaser_signed = TRUE WHERE id = p_po_id;
        v_next_status := 'pending_ceo_formal_paper';
        
    ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_formal_paper' THEN
        IF v_po.company = 'Cappadocia' THEN
            v_next_status := 'pending_whole_manager_payment';
        ELSE
            v_next_status := 'pending_payer';
        END IF;
        UPDATE purchase_orders SET status = v_next_status, ceo_signed = TRUE, ceo_signed_at = NOW() WHERE id = p_po_id;
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid role or PO status for signing formal paper');
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'new_status', v_next_status);
END;
$$;

-- 5. APPROVE PAYMENT (Whole Manager - Cappadocia only)
CREATE OR REPLACE FUNCTION po_approve_payment(p_po_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE purchase_orders 
    SET status = 'pending_payer'
    WHERE id = p_po_id AND status = 'pending_whole_manager_payment';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PO not found or invalid status');
    END IF;
    
    RETURN jsonb_build_object('success', TRUE, 'new_status', 'pending_payer');
END;
$$;

-- 6. RELEASE PAYMENT (Payer)
CREATE OR REPLACE FUNCTION po_release_payment(
    p_po_id UUID, 
    p_user_id UUID, 
    p_bank_name TEXT, 
    p_screenshot_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE purchase_orders 
    SET status = 'money_released', 
        bank_name = p_bank_name, 
        payment_screenshot_url = p_screenshot_url,
        money_released_at = NOW()
    WHERE id = p_po_id AND status = 'pending_payer';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PO not found or invalid status');
    END IF;
    
    RETURN jsonb_build_object('success', TRUE, 'new_status', 'money_released');
END;
$$;

-- 7. SHIP GOODS (Purchaser)
CREATE OR REPLACE FUNCTION po_ship_goods(p_po_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE purchase_orders 
    SET status = 'shipped', shipped_at = NOW()
    WHERE id = p_po_id AND status = 'money_released';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PO not found or not paid yet');
    END IF;
    
    RETURN jsonb_build_object('success', TRUE, 'new_status', 'shipped');
END;
$$;

-- 8. RECEIVE GOODS (Storekeeper)
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
        SET status = 'pending_foreman'
        WHERE id = v_po.sc_request_id::UUID;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'new_status', 'sk_received');
END;
$$;
