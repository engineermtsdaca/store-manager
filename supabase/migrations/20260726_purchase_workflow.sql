-- supabase/migrations/20260726_purchase_workflow.sql
-- New Roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'whole_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'purchase_assistant';

-- New PO Statuses (Phase 1: Request Approval)
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_site_manager_req';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_whole_manager_req';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_ceo_req';

-- New PO Statuses (Phase 2: Proforma)
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_purchaser_proforma';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_site_manager_prof';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_whole_manager_prof';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_ceo_prof';

-- New PO Statuses (Phase 3: Formal Paper & Payment)
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_pa_formal_paper';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_ceo_formal_paper';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'pending_whole_manager_payment';

-- Signature support
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- Update existing "coordinator" users to "ceo" if necessary (coordinator remains in enum, but let's shift data to ceo)
UPDATE user_profiles
SET role = 'ceo'
WHERE role = 'coordinator';
