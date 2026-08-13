-- ============================================================
-- CAPPADOCIA — DATABASE FUNCTIONS & STORED PROCEDURES
-- These are the "backend logic" that run atomically in Postgres
-- ============================================================

-- ============================================================
-- 1. LOG INVENTORY USAGE (Storekeeper daily SIV)
-- ============================================================
CREATE OR REPLACE FUNCTION log_inventory_usage(
  p_site_id   UUID,
  p_item_id   UUID,
  p_quantity  NUMERIC,
  p_user_id   UUID,
  p_notes     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item inventory_items%ROWTYPE;
  v_result JSONB;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  -- SECURITY (MED-05): Verify caller site authorization
  IF auth.uid() IS NOT NULL AND p_site_id IS NOT NULL AND p_site_id != (auth_user_profile()).site_id AND (auth_user_profile()).role NOT IN ('ceo', 'finance', 'whole_manager') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Unauthorized site access');
  END IF;

  -- Lock the row for update
  SELECT * INTO v_item FROM inventory_items
  WHERE id = p_item_id AND site_id = p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Item not found');
  END IF;

  IF v_item.remained < p_quantity THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Insufficient stock',
      'available', v_item.remained);
  END IF;

  UPDATE inventory_items
  SET used = used + p_quantity
  WHERE id = p_item_id;

  INSERT INTO inventory_logs (site_id, item_id, transaction_type, quantity, performed_by, notes)
  VALUES (p_site_id, p_item_id, 'used', p_quantity, p_user_id, p_notes);

  RETURN jsonb_build_object('success', TRUE, 'new_remained', v_item.remained - p_quantity);
END;
$$;

-- ============================================================
-- 2. ADD INVENTORY (Storekeeper receiving delivery or petty cash buy)
-- ============================================================
CREATE OR REPLACE FUNCTION add_inventory_item(
  p_site_id   UUID,
  p_name      TEXT,
  p_unit      TEXT,
  p_quantity  NUMERIC,
  p_source    inventory_source,  -- 'received' or 'bought'
  p_user_id   UUID,
  p_reference_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_id UUID;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  -- SECURITY (MED-05): Verify caller site authorization
  IF auth.uid() IS NOT NULL AND p_site_id IS NOT NULL AND p_site_id != (auth_user_profile()).site_id AND (auth_user_profile()).role NOT IN ('ceo', 'finance', 'whole_manager') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Unauthorized site access');
  END IF;

  -- Upsert the inventory item
  INSERT INTO inventory_items (site_id, name, unit, received, bought)
  VALUES (
    p_site_id, p_name, p_unit,
    CASE WHEN p_source = 'received' THEN p_quantity ELSE 0 END,
    CASE WHEN p_source = 'bought'   THEN p_quantity ELSE 0 END
  )
  ON CONFLICT (site_id, name) DO UPDATE SET
    received  = inventory_items.received  + CASE WHEN p_source = 'received' THEN p_quantity ELSE 0 END,
    bought    = inventory_items.bought    + CASE WHEN p_source = 'bought'   THEN p_quantity ELSE 0 END,
    unit      = EXCLUDED.unit
  RETURNING id INTO v_item_id;

  INSERT INTO inventory_logs (site_id, item_id, transaction_type, quantity, performed_by, reference_id)
  VALUES (p_site_id, v_item_id, p_source::TEXT, p_quantity, p_user_id, p_reference_id);

  RETURN jsonb_build_object('success', TRUE, 'item_id', v_item_id);
END;
$$;

-- ============================================================
-- 3. LOG WASTAGE (Storekeeper or Engineer)
-- ============================================================
CREATE OR REPLACE FUNCTION log_wastage(
  p_site_id     UUID,
  p_item_id     UUID,
  p_quantity    NUMERIC,
  p_reason      TEXT,
  p_photo_url   TEXT,
  p_reporter_role user_role,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item    inventory_items%ROWTYPE;
  v_rep_num TEXT;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  -- SECURITY (MED-05): Verify caller site authorization
  IF auth.uid() IS NOT NULL AND p_site_id IS NOT NULL AND p_site_id != (auth_user_profile()).site_id AND (auth_user_profile()).role NOT IN ('ceo', 'finance', 'whole_manager') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Unauthorized site access');
  END IF;

  SELECT * INTO v_item FROM inventory_items
  WHERE id = p_item_id AND site_id = p_site_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Item not found');
  END IF;

  IF v_item.remained < p_quantity THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot log wastage exceeding available stock');
  END IF;

  UPDATE inventory_items SET damaged = damaged + p_quantity WHERE id = p_item_id;

  v_rep_num := 'WS-' || LPAD(FLOOR(RANDOM()*9999)::TEXT, 4, '0');

  INSERT INTO wastage_reports (report_number, site_id, item_id, material_name, qty, reason, photo_url, reporter_role, reported_by)
  VALUES (v_rep_num, p_site_id, p_item_id, v_item.name, p_quantity, p_reason, p_photo_url, p_reporter_role, p_user_id);

  INSERT INTO inventory_logs (site_id, item_id, transaction_type, quantity, performed_by)
  VALUES (p_site_id, p_item_id, 'damaged', p_quantity, p_user_id);

  -- Notify manager
  INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_site_id, reference_type)
  VALUES ('Wastage reported', v_item.name || ' damage logged — manager review required.',
          'wastage_review', 'manager', p_site_id, 'wastage_report');

  RETURN jsonb_build_object('success', TRUE, 'report_number', v_rep_num);
END;
$$;

-- ============================================================
-- 4. INITIATE TRANSFER (Storekeeper)
-- ============================================================
CREATE OR REPLACE FUNCTION initiate_transfer(
  p_source_site_id UUID,
  p_dest_site_id   UUID,
  p_item_id        UUID,
  p_quantity       NUMERIC,
  p_transfer_type  transfer_type,
  p_user_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item       inventory_items%ROWTYPE;
  v_tr_num     TEXT;
  v_transfer_id UUID;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  SELECT * INTO v_item FROM inventory_items
  WHERE id = p_item_id AND site_id = p_source_site_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Item not found in source site');
  END IF;

  IF v_item.remained < p_quantity THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Insufficient stock');
  END IF;

  v_tr_num := 'TR-' || LPAD(FLOOR(RANDOM()*999)::TEXT, 3, '0');

  INSERT INTO material_transfers (
    transfer_number, source_site_id, dest_site_id,
    item_id, item_name, qty, unit,
    transfer_type, status, balance_before, requested_by
  )
  VALUES (
    v_tr_num, p_source_site_id, p_dest_site_id,
    p_item_id, v_item.name, p_quantity, v_item.unit,
    p_transfer_type, 'pending_manager', v_item.remained, p_user_id
  )
  RETURNING id INTO v_transfer_id;

  -- Notify manager
  INSERT INTO system_messages (title, body, action_key, recipient_role, reference_id, reference_type)
  VALUES ('Transfer requested', v_item.name || ' transfer is awaiting manager review.',
          'transfer_review', 'manager', v_transfer_id, 'material_transfer');

  RETURN jsonb_build_object('success', TRUE, 'transfer_id', v_transfer_id, 'transfer_number', v_tr_num);
END;
$$;

-- ============================================================
-- 5. MANAGER APPROVES/RETURNS TRANSFER
-- ============================================================
CREATE OR REPLACE FUNCTION manager_transfer_decision(
  p_transfer_id UUID,
  p_decision    TEXT,  -- 'approve' or 'return'
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tr material_transfers%ROWTYPE;
  v_src_company company_name;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  SELECT * INTO v_tr FROM material_transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Transfer not found');
  END IF;

  IF v_tr.status != 'pending_manager' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Transfer is not pending manager approval');
  END IF;

  IF p_decision = 'return' OR v_tr.transfer_type = 'inter' THEN
    UPDATE material_transfers SET status = 'returned_back', approved_by = p_user_id WHERE id = p_transfer_id;
    INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_site_id, reference_id, reference_type)
    VALUES ('Transfer returned', v_tr.item_name || ' transfer was returned by manager.',
            'transfer_review', 'storekeeper', v_tr.source_site_id, p_transfer_id, 'material_transfer');
  ELSE
    -- Intra-company → goes to finance
    UPDATE material_transfers SET status = 'pending_finance', approved_by = p_user_id WHERE id = p_transfer_id;
    SELECT company INTO v_src_company FROM sites WHERE id = v_tr.source_site_id;
    INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_company, reference_id, reference_type)
    VALUES ('Transfer needs verification', v_tr.item_name || ' intra-company transfer ready for finance audit.',
            'transfer_verify', 'finance', v_src_company, p_transfer_id, 'material_transfer');
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ============================================================
-- 6. FINANCE VERIFIES TRANSFER (deducts inventory atomically)
-- ============================================================
CREATE OR REPLACE FUNCTION finance_verify_transfer(
  p_transfer_id UUID,
  p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tr   material_transfers%ROWTYPE;
  v_item inventory_items%ROWTYPE;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  SELECT * INTO v_tr FROM material_transfers WHERE id = p_transfer_id FOR UPDATE;
  SELECT * INTO v_item FROM inventory_items WHERE id = v_tr.item_id FOR UPDATE;

  IF v_item.remained < v_tr.qty THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Insufficient stock at time of verification');
  END IF;

  -- Deduct from source
  UPDATE inventory_items
  SET transferred = transferred + v_tr.qty
  WHERE id = v_tr.item_id;

  -- Log
  INSERT INTO inventory_logs (site_id, item_id, transaction_type, quantity, performed_by, reference_id)
  VALUES (v_tr.source_site_id, v_tr.item_id, 'transferred_out', v_tr.qty, p_user_id, p_transfer_id);

  -- Complete transfer
  UPDATE material_transfers
  SET status = 'completed',
      verified_by = p_user_id,
      balance_after = v_item.remained - v_tr.qty
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', TRUE, 'new_balance', v_item.remained - v_tr.qty);
END;
$$;

-- ============================================================
-- 7. PAYER RELEASES PAYMENT
-- ============================================================
CREATE OR REPLACE FUNCTION payer_release_payment(
  p_po_id         UUID,
  p_bank_name     TEXT,
  p_bank_ref      TEXT,
  p_screenshot_url TEXT,
  p_user_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_po     purchase_orders%ROWTYPE;
  v_co     company_name;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;

  IF v_po.status != 'pending_payer' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'PO is not pending payer release');
  END IF;

  UPDATE purchase_orders
  SET status = 'money_released',
      bank_name = p_bank_name,
      bank_ref = p_bank_ref,
      payment_screenshot_url = p_screenshot_url,
      finance_audited = FALSE
  WHERE id = p_po_id;

  INSERT INTO po_status_history (po_id, from_status, to_status, changed_by)
  VALUES (p_po_id, 'pending_payer', 'money_released', p_user_id);

  -- Notify purchaser to ship
  INSERT INTO system_messages (title, body, action_key, recipient_role, reference_id, reference_type)
  VALUES ('Payment released — ship now', 'Payment for ' || v_po.po_number || ' confirmed. Execute purchase and ship.',
          'purchaser_ship_notice', 'purchaser', p_po_id, 'purchase_order');

  -- Notify finance to audit (non-blocking)
  SELECT company INTO v_co FROM sites WHERE id = v_po.site_id;
  INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_company, reference_id, reference_type)
  VALUES ('Finance audit pending', 'Verify payment evidence for ' || v_po.po_number || '.',
          'finance_verify', 'finance', v_co, p_po_id, 'purchase_order');

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ============================================================
-- 8. PETTY CASH EXPENSE
-- ============================================================
CREATE OR REPLACE FUNCTION log_petty_cash_expense(
  p_site_id     UUID,
  p_description TEXT,
  p_amount      NUMERIC,
  p_item_name   TEXT DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL,
  p_user_id     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account  petty_cash_accounts%ROWTYPE;
  v_new_bal  NUMERIC;
BEGIN
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  -- SECURITY (MED-05): Verify caller site authorization
  IF auth.uid() IS NOT NULL AND p_site_id IS NOT NULL AND p_site_id != (auth_user_profile()).site_id AND (auth_user_profile()).role NOT IN ('ceo', 'finance', 'whole_manager') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Unauthorized site access');
  END IF;

  SELECT * INTO v_account FROM petty_cash_accounts WHERE site_id = p_site_id FOR UPDATE;

  IF v_account.balance < p_amount THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Insufficient petty cash balance');
  END IF;

  v_new_bal := v_account.balance - p_amount;

  UPDATE petty_cash_accounts SET balance = v_new_bal, updated_at = NOW() WHERE site_id = p_site_id;

  INSERT INTO petty_cash_logs (site_id, description, amount, item_name, receipt_url, performed_by)
  VALUES (p_site_id, p_description, -p_amount, p_item_name, p_receipt_url, p_user_id);

  -- Trigger replenishment alert if below threshold
  IF v_new_bal < v_account.alert_threshold THEN
    INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_site_id)
    VALUES ('Petty cash low', 'Balance dropped below threshold — release 20,000 birr.',
            'petty_cash_replenish', 'payer', p_site_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'new_balance', v_new_bal);
END;
$$;

-- ============================================================
-- 9. WEEKLY TEMP STORE TRANSFER (Monday auto-action)
-- ============================================================
CREATE OR REPLACE FUNCTION weekly_temp_store_transfer(
  p_site_id UUID,
  p_qty_per_item NUMERIC DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE inventory_items
  SET remained   = GREATEST(0, remained - p_qty_per_item),
      temp_store = temp_store + p_qty_per_item
  WHERE site_id = p_site_id AND remained >= p_qty_per_item;

  INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_site_id)
  VALUES ('Weekly Transfer to Temp Store', 'Materials moved from main store to temporary store.',
          'sk_transfer_temp', 'storekeeper', p_site_id);

  INSERT INTO system_messages (title, body, action_key, recipient_role, recipient_site_id)
  VALUES ('Daily Temp Store Pickup', 'Receive daily materials from the temporary store.',
          'foreman_receive_temp', 'foreman', p_site_id);

  RETURN jsonb_build_object('success', TRUE);
END;
$$;
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
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

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
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

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
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

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
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

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
  -- SECURITY (MED-05): Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

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

-- PO REJECT
CREATE OR REPLACE FUNCTION po_reject_request(p_po_id UUID, p_user_id UUID, p_role user_role) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN IF p_role NOT IN ('manager', 'whole_manager', 'ceo', 'engineer') THEN RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized'); END IF; UPDATE purchase_orders SET status = 'blocked_mismatch' WHERE id = p_po_id; RETURN jsonb_build_object('success', TRUE, 'new_status', 'blocked_mismatch'); END; $$;
