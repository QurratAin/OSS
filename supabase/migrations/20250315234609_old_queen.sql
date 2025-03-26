/*
  # Safe Policy Creation Migration

  1. Changes
    - Add IF NOT EXISTS to all policy creation statements
    - Ensures idempotent policy creation
    - Maintains existing policies while allowing safe re-runs

  2. Security
    - Preserves existing service role permissions
    - No changes to existing security model
*/

-- Safely create policies for messages table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'messages' 
    AND policyname = 'Service role can insert messages'
  ) THEN
    CREATE POLICY "Service role can insert messages"
      ON messages
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'messages' 
    AND policyname = 'Service role can update messages'
  ) THEN
    CREATE POLICY "Service role can update messages"
      ON messages
      FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'messages' 
    AND policyname = 'Service role can delete messages'
  ) THEN
    CREATE POLICY "Service role can delete messages"
      ON messages
      FOR DELETE
      TO service_role
      USING (true);
  END IF;
END $$;

-- Safely create policies for msgtable_1
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'msgtable_1' 
    AND policyname = 'Service role can insert messages in msgtable_1'
  ) THEN
    CREATE POLICY "Service role can insert messages in msgtable_1"
      ON msgtable_1
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'msgtable_1' 
    AND policyname = 'Service role can update messages in msgtable_1'
  ) THEN
    CREATE POLICY "Service role can update messages in msgtable_1"
      ON msgtable_1
      FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'msgtable_1' 
    AND policyname = 'Service role can delete messages in msgtable_1'
  ) THEN
    CREATE POLICY "Service role can delete messages in msgtable_1"
      ON msgtable_1
      FOR DELETE
      TO service_role
      USING (true);
  END IF;
END $$;

-- Safely create policy for message_tables
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'message_tables' 
    AND policyname = 'Service role can manage message tables'
  ) THEN
    CREATE POLICY "Service role can manage message tables"
      ON message_tables
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;