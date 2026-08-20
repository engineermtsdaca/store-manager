-- Fix material_transfers, wastage_reports, petty_cash_accounts RLS

DROP POLICY IF EXISTS "transfers_insert" ON material_transfers;
CREATE POLICY "transfers_insert" ON material_transfers FOR INSERT WITH CHECK (
  (auth_user_profile()).role IN ('storekeeper', 'whole_manager', 'ceo', 'finance')
);

DROP POLICY IF EXISTS "transfers_update" ON material_transfers;
CREATE POLICY "transfers_update" ON material_transfers FOR UPDATE USING (
  (auth_user_profile()).role IN ('storekeeper', 'whole_manager', 'ceo', 'finance')
);

DROP POLICY IF EXISTS "wastage_insert" ON wastage_reports;
CREATE POLICY "wastage_insert" ON wastage_reports FOR INSERT WITH CHECK (
  (auth_user_profile()).role IN ('storekeeper', 'whole_manager', 'ceo')
);

DROP POLICY IF EXISTS "wastage_update" ON wastage_reports;
CREATE POLICY "wastage_update" ON wastage_reports FOR UPDATE USING (
  (auth_user_profile()).role IN ('whole_manager', 'ceo')
);

DROP POLICY IF EXISTS "petty_cash_insert" ON petty_cash_accounts;
CREATE POLICY "petty_cash_insert" ON petty_cash_accounts FOR INSERT WITH CHECK (
  (auth_user_profile()).role IN ('payer', 'finance', 'whole_manager', 'ceo')
);

DROP POLICY IF EXISTS "petty_cash_update" ON petty_cash_accounts;
CREATE POLICY "petty_cash_update" ON petty_cash_accounts FOR UPDATE USING (
  (auth_user_profile()).role IN ('payer', 'finance', 'whole_manager', 'ceo')
);

-- Fix add_inventory_item RPC to deduct from source site when manually receiving from another site

CREATE OR REPLACE FUNCTION public.add_inventory_item(
  p_site_id uuid,
  p_name text,
  p_unit text,
  p_quantity numeric,
  p_source inventory_source,
  p_user_id uuid,
  p_reference_id uuid DEFAULT NULL::uuid,
  p_from_site_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item_id UUID;
  v_from_item_id UUID;
BEGIN
  -- SECURITY: Verify caller identity
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Spoofed user ID');
  END IF;

  -- SECURITY: Verify caller site authorization
  IF auth.uid() IS NOT NULL AND p_site_id IS NOT NULL AND p_site_id != (auth_user_profile()).site_id AND (auth_user_profile()).role NOT IN ('ceo', 'finance', 'whole_manager', 'coordinator') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Security Definer: Unauthorized site access');
  END IF;

  -- Upsert the inventory item for the destination site
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

  -- If it was received from another site, deduct from their inventory by increasing transferred count
  IF p_source = 'received' AND p_from_site_id IS NOT NULL THEN
    -- Find the item in the source site
    SELECT id INTO v_from_item_id FROM inventory_items WHERE site_id = p_from_site_id AND name = p_name;
    IF FOUND THEN
      UPDATE inventory_items
      SET transferred = transferred + p_quantity
      WHERE id = v_from_item_id;
      
      INSERT INTO inventory_logs (site_id, item_id, transaction_type, quantity, performed_by, reference_id)
      VALUES (p_from_site_id, v_from_item_id, 'transferred_out', p_quantity, p_user_id, p_reference_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'item_id', v_item_id);
END;
$function$;
