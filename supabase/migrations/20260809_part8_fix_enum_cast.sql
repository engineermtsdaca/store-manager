-- Fix for the "column status is of type po_status but expression is of type text" error

CREATE OR REPLACE FUNCTION po_authorize_request(
    p_po_id UUID,
    p_user_id UUID,
    p_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
  DECLARE
      v_po purchase_orders%ROWTYPE;
      v_next_status po_status; -- FIXED: use po_status instead of TEXT
  BEGIN
      SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
      IF NOT FOUND THEN
          RETURN jsonb_build_object('success', false, 'error', 'PO not found');
      END IF;

      IF p_role = 'manager' AND v_po.status = 'pending_site_manager_req' THEN
          v_next_status := 'pending_whole_manager_req';
      ELSIF p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_req' THEN
          v_next_status := 'pending_ceo_req';
      ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_req' THEN
          v_next_status := 'pending_purchaser_proforma';
      ELSE
          RETURN jsonb_build_object('success', false, 'error', 'Invalid status for your role authorization');
      END IF;

      UPDATE purchase_orders SET status = v_next_status WHERE id = p_po_id;
      RETURN jsonb_build_object('success', true, 'new_status', v_next_status);
  END;
$$;

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
      v_next_status po_status; -- FIXED: use po_status instead of TEXT
  BEGIN
      SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
      IF NOT FOUND THEN
          RETURN jsonb_build_object('success', false, 'error', 'PO not found');
      END IF;

      IF p_reject THEN
          IF (p_role = 'manager' AND v_po.status = 'pending_site_manager_prof') OR
             (p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_prof') OR
             (p_role = 'ceo' AND v_po.status = 'pending_ceo_prof') THEN
             
             UPDATE purchase_orders SET status = 'pending_purchaser_proforma', proforma_attached = false WHERE id = p_po_id;
             RETURN jsonb_build_object('success', true, 'new_status', 'pending_purchaser_proforma');
          ELSE
             RETURN jsonb_build_object('success', false, 'error', 'Cannot reject at this stage');
          END IF;
      END IF;

      IF p_role = 'manager' AND v_po.status = 'pending_site_manager_prof' THEN
          v_next_status := 'pending_whole_manager_prof';
      ELSIF p_role = 'whole_manager' AND v_po.status = 'pending_whole_manager_prof' THEN
          v_next_status := 'pending_ceo_prof';
      ELSIF p_role = 'ceo' AND v_po.status = 'pending_ceo_prof' THEN
          v_next_status := 'pending_pa_formal_paper';
      ELSE
          RETURN jsonb_build_object('success', false, 'error', 'Invalid status for your proforma review');
      END IF;

      UPDATE purchase_orders SET status = v_next_status WHERE id = p_po_id;
      RETURN jsonb_build_object('success', true, 'new_status', v_next_status);
  END;
$$;
