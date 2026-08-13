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
