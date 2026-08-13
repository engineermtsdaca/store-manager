-- ============================================================
-- PART 7: FIX SM1 PO READ ACCESS + PROFORMA NOTIFICATION ROUTING
-- Problem: When pur1 attaches proformas, the notification was
-- going to recipient_role='manager', but the po_read RLS policy
-- excluded 'manager' role so sm1 couldn't see those POs at all.
-- This also fixes the trigger to properly notify sm1.
-- ============================================================

-- 1. Fix po_read policy so 'manager' (sm1) can see ALL purchase_orders
--    on their site (needed for the proforma review step)
DROP POLICY IF EXISTS "po_read" ON purchase_orders;
CREATE POLICY "po_read" ON purchase_orders FOR SELECT
  USING (
    (auth_user_profile()).role IN ('whole_manager','ceo','purchaser','payer','finance','purchase_assistant')
    OR site_id = (auth_user_profile()).site_id
  );
-- Note: 'manager' and 'storekeeper' and 'engineer' already get site-level access
-- via the "OR site_id = (auth_user_profile()).site_id" clause above.
-- This was always correct — sm1 is on Friendship Site and can see Friendship Site POs.

-- 2. Fix the system_messages policy so 'manager' receives messages
DROP POLICY IF EXISTS "messages_read" ON system_messages;
CREATE POLICY "messages_read" ON system_messages FOR SELECT
  USING (
    recipient_role = (auth_user_profile()).role
    AND (recipient_company IS NULL OR recipient_company = (auth_user_profile()).company)
    AND (recipient_site_id IS NULL OR recipient_site_id = (auth_user_profile()).site_id)
    AND (recipient_user_id IS NULL OR recipient_user_id = auth.uid())
  );
-- This policy is already role-agnostic so it should work for 'manager'.
-- The real problem is that the trigger sends to recipient_role='manager'
-- but the system_messages have recipient_site_id=NULL (central roles),
-- so sm1 (site-level manager) never received them.

-- 3. Fix the PO notification trigger to properly route proforma notifications
--    to sm1 (manager) at their specific site_id
CREATE OR REPLACE FUNCTION trigger_po_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_action_key TEXT;
    v_recipient_role user_role;
    v_title TEXT;
    v_body TEXT;
    v_target_site_id UUID;
BEGIN
    -- Only fire if the status has actually changed
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    -- Default: no site targeting (for central roles)
    v_target_site_id := NULL;

    -- Determine notification details based on the NEW status
    CASE NEW.status
        WHEN 'pending_site_manager_req' THEN
            v_action_key := 'manager_approvals';
            v_recipient_role := 'manager';
            v_title := 'PO Request Approval';
            v_body := 'New purchase request needs site manager authorization.';
            v_target_site_id := NEW.site_id; -- Target sm1 on this specific site

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
            v_target_site_id := NEW.site_id; -- Target sm1 on this specific site

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
            v_target_site_id := NEW.site_id; -- Target SK on specific site

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
        v_target_site_id,
        'purchase_order', NEW.id
    );

    RETURN NEW;
END;
$$;

-- Rebind the trigger
DROP TRIGGER IF EXISTS trg_po_notifications ON purchase_orders;
CREATE TRIGGER trg_po_notifications
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_po_notifications();

-- 4. Also fix the po_authorize_request RPC to properly handle sm1 (manager role)
--    The RPC already checks for 'manager' in the first step — that part is fine.
--    But we need to verify the proforma approval chain handles manager correctly too.
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

    -- sm1 (manager) approves initial site-level request
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

-- ============================================================
-- RECOVERY: Inject notifications for POs already stuck in
-- 'pending_site_manager_prof' from yesterday's failed proforma
-- attachments. These POs exist but sm1 never got notified.
-- ============================================================
INSERT INTO system_messages (
    title, body, action_key, recipient_role,
    recipient_site_id, reference_type, reference_id
)
SELECT
    'Proforma Review' AS title,
    'Proformas attached. Needs site manager review.' AS body,
    'manager_approvals' AS action_key,
    'manager'::user_role AS recipient_role,
    po.site_id AS recipient_site_id,
    'purchase_order' AS reference_type,
    po.id AS reference_id
FROM purchase_orders po
WHERE po.status = 'pending_site_manager_prof'
  AND NOT EXISTS (
    SELECT 1 FROM system_messages sm
    WHERE sm.reference_id = po.id
      AND sm.reference_type = 'purchase_order'
      AND sm.action_key = 'manager_approvals'
      AND sm.is_dismissed = FALSE
  );
-- 5. Fix po_approve_proforma to handle sm1 (manager role) for proforma review
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

    -- sm1 (manager) reviews proforma at site level first
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
