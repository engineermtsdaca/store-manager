-- ============================================================================
-- Fix for Material Returns Flow (Option 3)
-- This migration opens up specific RLS policies so the Return Material flow
-- works seamlessly for Subcontractors and Storekeepers without requiring the
-- Admin Service Role Key in the backend.
-- ============================================================================

-- 1. Allow authenticated users (Subcontractors, Storekeepers) to send system messages
DROP POLICY IF EXISTS "messages_insert" ON system_messages;
CREATE POLICY "messages_insert" ON system_messages FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- 2. Allow Storekeepers to delete the pending system message once approved
DROP POLICY IF EXISTS "messages_delete" ON system_messages;
CREATE POLICY "messages_delete" ON system_messages FOR DELETE
USING (auth.role() = 'authenticated');

-- Note: Subcontractor no longer needs to update material_requests, as the Storekeeper handles that.
