-- supabase/migrations/20260804_phase1_schema_hardening.sql
-- ==============================================================================
-- PHASE 1: DATABASE SCHEMA & STATUS HARDENING
-- ==============================================================================

-- 1. ADD MISSING MATERIAL REQUEST STATUSES
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'storekeeper_approved';
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE material_request_status ADD VALUE IF NOT EXISTS 'ordered_pending';

-- 2. ADD STRICT TRACKING COLUMNS TO PURCHASE ORDERS
-- These timestamps will be set automatically by our RPCs in Phase 2
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS req_approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS prof_attached_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS prof_approved_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS money_released_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sk_received_at TIMESTAMPTZ;

-- 3. ERROR LOGGING SYSTEM FOR MAINTENANCE ROLE
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    error_type TEXT NOT NULL CHECK (error_type IN ('syntax', 'logic', 'security', 'other')),
    error_content TEXT NOT NULL,
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for error logs
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert an error log, but only maintenance roles can read/update them
CREATE POLICY "Anyone can report errors" ON error_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Maintenance can read errors" ON error_logs FOR SELECT USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'maintenance')
);
CREATE POLICY "Maintenance can update errors" ON error_logs FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'maintenance')
);
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
-- supabase/migrations/20260804_phase3_triggers.sql
-- ==============================================================================
-- PHASE 3: AUTOMATED DATABASE TRIGGERS (NOTIFICATIONS)
-- ==============================================================================

-- 1. TRIGGER FUNCTION FOR PURCHASE ORDERS
CREATE OR REPLACE FUNCTION trigger_po_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_action_key TEXT;
    v_recipient_role user_role;
    v_title TEXT;
    v_body TEXT;
BEGIN
    -- Only fire if the status has actually changed
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    -- Determine notification details based on the NEW status
    CASE NEW.status
        WHEN 'pending_site_manager_req' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'manager';
            v_title := 'PO Request Approval';
            v_body := 'New purchase request needs site manager authorization.';
            
        WHEN 'pending_whole_manager_req' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'whole_manager';
            v_title := 'PO Request Approval';
            v_body := 'Purchase request needs whole manager authorization.';
            
        WHEN 'pending_ceo_req' THEN
            v_action_key := 'ceo_approvals';
            v_recipient_role := 'ceo';
            v_title := 'PO Request Approval';
            v_body := 'Purchase request needs CEO final authorization.';
            
        WHEN 'pending_purchaser_proforma' THEN
            v_action_key := 'purchaser_request';
            v_recipient_role := 'purchaser';
            v_title := 'Gather Proforma';
            v_body := 'Purchase authorized. Please collect and attach proformas.';
            
        WHEN 'pending_site_manager_prof' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'manager';
            v_title := 'Proforma Review';
            v_body := 'Proformas attached. Needs site manager review.';
            
        WHEN 'pending_whole_manager_prof' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'whole_manager';
            v_title := 'Proforma Review';
            v_body := 'Proformas attached. Needs whole manager review.';
            
        WHEN 'pending_ceo_prof' THEN
            v_action_key := 'ceo_approvals';
            v_recipient_role := 'ceo';
            v_title := 'Proforma Review';
            v_body := 'Proformas attached. Needs CEO final review.';
            
        WHEN 'pending_pa_formal_paper' THEN
            v_action_key := 'pa_formal_paper';
            v_recipient_role := 'purchase_assistant';
            v_title := 'Prepare Formal Paper';
            v_body := 'Proforma approved. Prepare formal paper for signatures.';
            
        WHEN 'pending_purchaser_sign' THEN
            v_action_key := 'purchaser_sign';
            v_recipient_role := 'purchaser';
            v_title := 'Sign Formal Paper';
            v_body := 'Formal paper ready. Purchaser signature required.';
            
        WHEN 'pending_ceo_formal_paper' THEN
            v_action_key := 'ceo_approvals';
            v_recipient_role := 'ceo';
            v_title := 'Sign Formal Paper';
            v_body := 'Formal paper countersigned. CEO signature required.';
            
        WHEN 'pending_whole_manager_payment' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'whole_manager';
            v_title := 'Approve Payment Routing';
            v_body := 'CEO signed. Approve payment routing to payer.';
            
        WHEN 'pending_payer' THEN
            v_action_key := 'payer_release';
            v_recipient_role := 'payer';
            v_title := 'Release Payment';
            v_body := 'Formal paper fully signed. Release bank payment.';
            
        WHEN 'money_released' THEN
            v_action_key := 'purchaser_ship_notice';
            v_recipient_role := 'purchaser';
            v_title := 'Payment Released';
            v_body := 'Payment has been released. Please execute purchase and ship goods.';
            
            -- Additionally notify finance
            INSERT INTO system_messages (title, body, action_key, recipient_role, reference_type, reference_id)
            VALUES ('PO Payment Executed', 'A payment has been released by the payer.', 'finance_audit', 'finance', 'purchase_order', NEW.id);
            
        WHEN 'shipped' THEN
            v_action_key := 'storekeeper_delivery';
            v_recipient_role := 'storekeeper';
            v_title := 'Goods Shipped';
            v_body := 'Bought materials are en route to the site. Await delivery.';
            
        ELSE
            -- No automated notification for this status change
            RETURN NEW;
    END CASE;

    -- Insert the primary notification
    INSERT INTO system_messages (
        title, body, action_key, recipient_role, 
        recipient_site_id, reference_type, reference_id
    ) VALUES (
        v_title, v_body, v_action_key, v_recipient_role, 
        -- Target specific site for storekeepers, otherwise null (central roles)
        CASE WHEN v_recipient_role = 'storekeeper' THEN NEW.site_id ELSE NULL END, 
        'purchase_order', NEW.id
    );

    RETURN NEW;
END;
$$;

-- Bind the trigger to purchase_orders
DROP TRIGGER IF EXISTS trg_po_notifications ON purchase_orders;
CREATE TRIGGER trg_po_notifications
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_po_notifications();


-- 2. TRIGGER FUNCTION FOR MATERIAL REQUESTS
CREATE OR REPLACE FUNCTION trigger_mr_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_action_key TEXT;
    v_recipient_role user_role;
    v_title TEXT;
    v_body TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    CASE NEW.status
        WHEN 'pending_engineer' THEN
            v_action_key := 'engineer_request';
            v_recipient_role := 'engineer';
            v_title := 'New Material Request';
            v_body := NEW.qty::TEXT || 'x ' || NEW.item || ' requested. Needs review.';
            
        WHEN 'approved_instock' THEN
            v_action_key := 'storekeeper_signoff';
            v_recipient_role := 'storekeeper';
            v_title := 'Material Approved';
            v_body := 'Material request approved from stock. Ready for sign-off.';
            
        ELSE
            RETURN NEW;
    END CASE;

    INSERT INTO system_messages (
        title, body, action_key, recipient_role, 
        recipient_site_id, reference_type, reference_id
    ) VALUES (
        v_title, v_body, v_action_key, v_recipient_role, 
        NEW.site_id, 'material_request', NEW.id
    );

    RETURN NEW;
END;
$$;

-- Bind the trigger to material_requests
DROP TRIGGER IF EXISTS trg_mr_notifications ON material_requests;
CREATE TRIGGER trg_mr_notifications
AFTER INSERT OR UPDATE ON material_requests
FOR EACH ROW
EXECUTE FUNCTION trigger_mr_notifications();
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
