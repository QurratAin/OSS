/*
  # Add anon policy for auth_codes

  1. Changes
    - Add policy for anon role to insert auth codes
    - Maintain existing policies
  
  2. Security
    - Allow anon role to create auth codes (needed for client-side auth)
    - Keep existing security model intact
*/

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Service role can manage auth codes" ON auth_codes;
  DROP POLICY IF EXISTS "Users can read own auth codes" ON auth_codes;
  DROP POLICY IF EXISTS "Anon can create auth codes" ON auth_codes;
END $$;

-- Create new policies
CREATE POLICY "Service role can manage auth codes"
  ON auth_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can read own auth codes"
  ON auth_codes
  FOR SELECT
  TO authenticated
  USING (phone_number = current_user);

CREATE POLICY "Anon can create auth codes"
  ON auth_codes
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE auth_codes ENABLE ROW LEVEL SECURITY;