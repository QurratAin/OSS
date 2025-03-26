/*
  # Remove author column from messages table

  1. Changes
    - Remove author column from messages table
    - Remove author column from msgtable_1
    - Update validation function to remove author check
  
  2. Security
    - No security changes required
    - Existing RLS policies remain unchanged
*/

-- Remove author column from messages table
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'messages' 
    AND column_name = 'author'
  ) THEN
    ALTER TABLE messages DROP COLUMN author;
  END IF;
END $$;

-- Remove author column from msgtable_1
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'msgtable_1' 
    AND column_name = 'author'
  ) THEN
    ALTER TABLE msgtable_1 DROP COLUMN author;
  END IF;
END $$;

-- Update message validation function
CREATE OR REPLACE FUNCTION validate_message()
RETURNS trigger AS $$
BEGIN
  -- Check required fields
  IF NEW.content IS NULL OR NEW.content = '' THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  IF NEW.timestamp IS NULL THEN
    RAISE EXCEPTION 'Message timestamp cannot be null';
  END IF;

  IF NEW.group_id IS NULL OR NEW.group_id = '' THEN
    RAISE EXCEPTION 'Message group_id cannot be empty';
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Message user_id cannot be null';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;