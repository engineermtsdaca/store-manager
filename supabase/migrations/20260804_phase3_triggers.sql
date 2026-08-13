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
