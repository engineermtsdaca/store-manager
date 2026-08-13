-- =============================================================================
-- New User Accounts for Out-of-Stock Workflow
-- Run this in Supabase SQL Editor or via CLI
-- =============================================================================

-- NOTE: For auth users, use Supabase Dashboard → Authentication → Users → Add User
-- or use the service-role client to call supabase.auth.admin.createUser()
-- Below are the user_profiles updates/inserts to run AFTER creating Auth accounts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ADDIS — Site Manager (role: 'manager')
--    Account: SM1 / password: your-choice
--    After creating auth user, update their profile:
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE user_profiles
-- SET
--   username     = 'SM1',
--   name_en      = 'Addis',
--   name_am      = 'አዲስ',
--   role         = 'manager',
--   site_id      = '<friendship-site-uuid>',   -- set to appropriate site
--   company      = 'Cappadocia'
-- WHERE id = '<addis-auth-user-uuid>';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BISRAT — Purchase Assistant (role: 'purchase_assistant')
--    Account: ASSIST1 / password: your-choice
-- ─────────────────────────────────────────────────────────────────────────────
-- INSERT INTO user_profiles (id, username, name_en, name_am, role, company)
-- VALUES (
--   '<bisrat-auth-user-uuid>',
--   'ASSIST1',
--   'Bisrat',
--   'ቢስራት',
--   'purchase_assistant',
--   'Cappadocia'
-- );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEBLE — Payer 1 (role: 'payer', company: 'Cappadocia')
--    Update existing PAYER1 account:
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE user_profiles
-- SET
--   name_en  = 'Seble',
--   name_am  = 'ሴቤ',
--   company  = 'Cappadocia'
-- WHERE username = 'PAYER1';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. KIDIST — Payer 2 (role: 'payer', company: 'Vila Verde' OR 'Addisu Habte')
--    Account: PAYER2 / password: your-choice
--    Kidist pays for both Vila Verde AND Addisu Habte.
--    The app routes to her based on company != 'Cappadocia'.
-- ─────────────────────────────────────────────────────────────────────────────
-- INSERT INTO user_profiles (id, username, name_en, name_am, role, company)
-- VALUES (
--   '<kidist-auth-user-uuid>',
--   'PAYER2',
--   'Kidist',
--   'ቅድስት',
--   'payer',
--   'Vila Verde'   -- her "home" company; the app filters by company != 'Cappadocia'
-- );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Finance users per company (if not already created)
--    FIN1 = Cappadocia finance
--    FIN2 = Addisu Habte finance
--    FIN3 = Vila Verde finance
-- ─────────────────────────────────────────────────────────────────────────────
-- These are already referenced in the code via recipient_company filter.
-- Ensure each finance user profile has:
--   role    = 'finance'
--   company = '<their-company>'

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE ENUM CHECK
-- If 'purchase_assistant' or 'ceo' are not in the user_role enum, add them:
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'purchase_assistant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ceo';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'whole_manager';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERY
-- Run this to see all current user profiles and their roles:
-- SELECT username, name_en, role, company, site_id FROM user_profiles ORDER BY role;
-- ─────────────────────────────────────────────────────────────────────────────
