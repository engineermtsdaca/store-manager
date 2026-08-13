-- ============================================================
-- Migration: Add Password Reset & Telegram Recovery Columns
-- Run this in: Supabase Dashboard → SQL Editor
-- Or run: node scripts/apply-recovery-phone-migration.js
-- ============================================================

-- Add recovery columns to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS recovery_phone    TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id  TEXT,
  ADD COLUMN IF NOT EXISTS reset_otp         TEXT,
  ADD COLUMN IF NOT EXISTS reset_otp_expires_at TIMESTAMPTZ;

-- Add index for Telegram chat_id lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_telegram_chat_id
  ON user_profiles(telegram_chat_id);

-- Allow users to update their own profile (recovery phone)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
    AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY "profiles_update_own" ON user_profiles
      FOR UPDATE
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;
