-- ============================================================
-- FINAL FIX FOR SM1 (SITE MANAGER)
-- This script does TWO things:
-- 1. Sets SM1's role back to 'manager' (so they aren't a Whole Manager anymore)
-- 2. Sets SM1's site_id to match 'Friendship Site' (so they can see ENG1's orders)
-- ============================================================

UPDATE public.user_profiles
SET 
  role = 'manager',
  site_id = (SELECT id FROM sites WHERE name = 'Friendship Site' LIMIT 1)
WHERE LOWER(username) = 'sm1';
