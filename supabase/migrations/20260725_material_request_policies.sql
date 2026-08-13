-- ============================================================
-- MISSING POLICIES FOR MATERIAL REQUESTS
-- ============================================================

-- Material Requests: site-level + managers/coordinators
CREATE POLICY "material_requests_read" ON material_requests FOR SELECT
  USING (
    (auth_user_profile()).role IN ('manager','coordinator','ceo', 'finance', 'purchaser')
    OR site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "material_requests_insert" ON material_requests FOR INSERT
  WITH CHECK (
    site_id = (auth_user_profile()).site_id
  );

CREATE POLICY "material_requests_update" ON material_requests FOR UPDATE
  USING (
    (auth_user_profile()).role IN ('manager','coordinator','ceo', 'purchaser')
    OR site_id = (auth_user_profile()).site_id
  );
