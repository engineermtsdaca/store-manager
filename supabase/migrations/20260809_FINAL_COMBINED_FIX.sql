-- ============================================================
-- FINAL FIX FOR SM1 PROFORMA VISIBILITY
-- Run this ENTIRE file in the Supabase SQL Editor
-- ============================================================

-- 1. Ensure sm1 is definitively a 'manager' and assigned to 'Friendship Site'
UPDATE public.user_profiles
SET 
  role = 'manager',
  site_id = (SELECT id FROM sites WHERE name = 'Friendship Site' LIMIT 1)
WHERE LOWER(username) = 'sm1';

-- 2. Ensure po_read policy includes manager explicitly just in case site_id matching fails
DROP POLICY IF EXISTS "po_read" ON purchase_orders;
CREATE POLICY "po_read" ON purchase_orders FOR SELECT
  USING (
    (auth_user_profile()).role IN ('manager','whole_manager','ceo','purchaser','payer','finance','purchase_assistant')
    OR site_id = (auth_user_profile()).site_id
  );

-- 3. Fix the Notification Trigger to properly route proformas to the exact site manager
CREATE OR REPLACE FUNCTION trigger_po_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_action_key TEXT;
    v_recipient_role user_role;
    v_title TEXT;
    v_body TEXT;
    v_target_site_id UUID := NULL;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    CASE NEW.status
        WHEN 'pending_site_manager_req' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'manager';
            v_target_site_id := NEW.site_id; 
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
            v_target_site_id := NEW.site_id;
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
            
        ELSE
            RETURN NEW;
    END CASE;

    INSERT INTO system_messages (
        title, body, action_key, recipient_role, 
        recipient_site_id, reference_type, reference_id
    ) VALUES (
        v_title, v_body, v_action_key, v_recipient_role, 
        v_target_site_id, 'purchase_order', NEW.id
    );

    RETURN NEW;
END;
$$;

-- 4. Fix po_authorize_request RPC
CREATE OR REPLACE FUNCTION po_authorize_request(
    p_po_id UUID,
    p_user_id UUID,
    p_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_po purchase_orders%ROWTYPE;
    v_next_status TEXT;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF p_role = 'manager' AND v_po.status = 'pending_site_manager_req' THEN
        v_next_status := 'pending_whole_manager_req';
    ELSIF p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_req' THEN
        v_next_status := 'pending_ceo_req';
    ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_req' THEN
        v_next_status := 'pending_purchaser_proforma';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid status for your role authorization');
    END IF;

    UPDATE purchase_orders SET status = v_next_status WHERE id = p_po_id;
    RETURN jsonb_build_object('success', TRUE, 'new_status', v_next_status);
END;
$$;

-- 5. Fix po_approve_proforma RPC
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
    v_next_status TEXT;
BEGIN
    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

    IF p_reject THEN
        IF (p_role = 'manager' AND v_po.status = 'pending_site_manager_prof') OR
           (p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_prof') OR
           (p_role = 'ceo' AND v_po.status = 'pending_ceo_prof') THEN
            UPDATE purchase_orders 
            SET status = 'pending_purchaser_proforma', proforma_attached = FALSE 
            WHERE id = p_po_id;
            RETURN jsonb_build_object('success', TRUE, 'new_status', 'pending_purchaser_proforma');
        ELSE
            RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot reject at this stage');
        END IF;
    END IF;

    IF p_role = 'manager' AND v_po.status = 'pending_site_manager_prof' THEN
        v_next_status := 'pending_whole_manager_prof';
    ELSIF p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_prof' THEN
        v_next_status := 'pending_ceo_prof';
    ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_prof' THEN
        v_next_status := 'pending_pa_formal_paper';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid status for your proforma review');
    END IF;

    UPDATE purchase_orders SET status = v_next_status WHERE id = p_po_id;
    RETURN jsonb_build_object('success', TRUE, 'new_status', v_next_status);
END;
$$;

-- 6. RECOVERY: Inject missing system messages for already-stuck POs
INSERT INTO system_messages (
    title, body, action_key, recipient_role, 
    recipient_site_id, reference_type, reference_id
)
SELECT 
    'Proforma Review', 
    'Proformas attached. Needs site manager review.', 
    'manager_approvals', 
    'manager' AS recipient_role, 
    po.site_id AS recipient_site_id, 
    'purchase_order', 
    po.id
FROM purchase_orders po
WHERE po.status = 'pending_site_manager_prof'
  AND NOT EXISTS (
      SELECT 1 FROM system_messages sm 
      WHERE sm.reference_id = po.id 
        AND sm.action_key = 'manager_approvals'
        AND sm.recipient_role = 'manager'
  );
