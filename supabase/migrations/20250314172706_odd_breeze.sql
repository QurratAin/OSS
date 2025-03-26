/*
  # Improve Database Functions and Structure

  1. Changes
    - Add error handling to create_message_table function
    - Improve get_message_table function with better error handling
    - Add foreign key constraints
    - Add NOT NULL constraints where appropriate
    - Add validation functions
  
  2. Security
    - Additional checks for data integrity
    - Better error reporting
*/

-- Add NOT NULL constraint to message_tables.table_name
ALTER TABLE message_tables 
ALTER COLUMN table_name SET NOT NULL;

-- Add foreign key constraint to messages.user_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'messages_user_id_fkey'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END $$;

-- Improved function to validate table name
CREATE OR REPLACE FUNCTION validate_table_name(table_name text)
RETURNS boolean AS $$
BEGIN
  RETURN table_name ~ '^msgtable_[0-9]+$';
END;
$$ LANGUAGE plpgsql;

-- Improved function to create new message table with error handling
CREATE OR REPLACE FUNCTION create_message_table(table_number int, start_timestamp timestamptz)
RETURNS void AS $$
DECLARE
  new_table_name text;
BEGIN
  -- Validate input
  IF table_number <= 0 THEN
    RAISE EXCEPTION 'Invalid table number: %', table_number;
  END IF;

  IF start_timestamp IS NULL THEN
    RAISE EXCEPTION 'Start timestamp cannot be null';
  END IF;

  -- Generate table name
  new_table_name := 'msgtable_' || table_number;

  -- Validate table name
  IF NOT validate_table_name(new_table_name) THEN
    RAISE EXCEPTION 'Invalid table name format: %', new_table_name;
  END IF;

  -- Check if table already exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = new_table_name
  ) THEN
    RAISE EXCEPTION 'Table % already exists', new_table_name;
  END IF;

  -- Create the new table
  EXECUTE format('
    CREATE TABLE %I (
      LIKE messages INCLUDING ALL,
      CONSTRAINT %I CHECK (
        timestamp >= %L::timestamptz
      )
    ) INHERITS (messages);
    
    CREATE INDEX %I ON %I(timestamp);
    
    ALTER TABLE %I ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can read messages from %I"
      ON %I
      FOR SELECT
      TO authenticated
      USING (true);
  ', 
  new_table_name,
  new_table_name || '_timestamp_check',
  start_timestamp,
  'idx_' || new_table_name || '_timestamp',
  new_table_name,
  new_table_name,
  new_table_name,
  new_table_name);

  -- Record the new table
  INSERT INTO message_tables (table_name, start_date)
  VALUES (new_table_name, start_timestamp);
  
  -- Update end_date of previous table
  UPDATE message_tables
  SET end_date = start_timestamp
  WHERE table_name = 'msgtable_' || (table_number - 1);

EXCEPTION
  WHEN others THEN
    -- Clean up if table was partially created
    EXECUTE format('DROP TABLE IF EXISTS %I', new_table_name);
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Improved function to get appropriate table for a timestamp
CREATE OR REPLACE FUNCTION get_message_table(msg_timestamp timestamptz)
RETURNS text AS $$
DECLARE
  target_table text;
BEGIN
  -- Validate input
  IF msg_timestamp IS NULL THEN
    RAISE EXCEPTION 'Message timestamp cannot be null';
  END IF;

  -- Get the appropriate table
  SELECT table_name INTO target_table
  FROM message_tables
  WHERE (end_date IS NULL OR msg_timestamp < end_date)
    AND msg_timestamp >= start_date
  ORDER BY start_date DESC
  LIMIT 1;
  
  -- Handle case where no table is found
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'No suitable table found for timestamp %', msg_timestamp;
  END IF;

  -- Validate table exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_name = target_table
  ) THEN
    RAISE EXCEPTION 'Target table % does not exist', target_table;
  END IF;

  RETURN target_table;
END;
$$ LANGUAGE plpgsql;

-- Function to validate message before insertion
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

  IF NEW.author IS NULL OR NEW.author = '' THEN
    RAISE EXCEPTION 'Message author cannot be empty';
  END IF;

  IF NEW.group_id IS NULL OR NEW.group_id = '' THEN
    RAISE EXCEPTION 'Message group_id cannot be empty';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for message validation
CREATE TRIGGER validate_message_trigger
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION validate_message();

-- Create the same trigger for msgtable_1
CREATE TRIGGER validate_message_trigger_1
  BEFORE INSERT OR UPDATE ON msgtable_1
  FOR EACH ROW
  EXECUTE FUNCTION validate_message();