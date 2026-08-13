-- ============================================================
-- PART 6: FIX SM1 SITE ID
-- Ensures SM1 is assigned to the 'Friendship Site' so they
-- can see the Purchase Orders created by ENG1 (who is also on Friendship Site).
-- ============================================================

UPDATE public.user_profiles
SET site_id = (SELECT id FROM sites WHERE name = 'Friendship Site' LIMIT 1)
WHERE LOWER(username) = 'sm1';
