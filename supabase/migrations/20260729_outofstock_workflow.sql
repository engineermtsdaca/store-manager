-- supabase/migrations/20260729_outofstock_workflow.sql
-- Full Out-of-Stock Purchase Workflow Extensions

-- New PO status: Purchaser (Alemu) signs after Bisrat prepares formal paper
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_purchaser_sign';

-- SK confirms physical receipt of bought/shipped goods
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'sk_received';

-- Fully closed after SK confirmed + SC notified
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'completed_sc_notified';

-- Track whether this PO came from a Subcontractor material request
-- (determines whether SC is notified when SK receives goods)
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS from_sc_request BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sc_request_id TEXT;

-- Formal paper signing state columns
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS formal_paper_url TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pa_signed BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchaser_signed BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ceo_signed BOOLEAN DEFAULT FALSE;

-- Note: Run this in Supabase SQL Editor before testing.
-- All ALTER TYPE ADD VALUE statements are non-destructive (IF NOT EXISTS guards).
