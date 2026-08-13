-- Allow authenticated users to view user_profiles
CREATE POLICY "Authenticated users can view user_profiles"
ON "public"."user_profiles"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (true);
