/*
  # Improve Message Tables Tracking

  1. Changes
    - Add last_message_timestamp column to message_tables
    - Add message_sync_status table for tracking last sync
    - Add function to update table end dates
    - Add function to track message sync status
  
  2. Security
    - RLS policies for new table
    - Service role access for sync operations
*/

-- Add last_message_timestamp to message_tables
ALTER TABLE message_tables 
ADD COLUMN IF NOT EXISTS last_message_timestamp timestamptz;

-- Create message sync status table
CREATE TABLE IF NOT EXISTS message_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  last_sync_timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on new table
ALTER TABLE message_sync_status ENABLE ROW LEVEL SECURITY;

-- Add policies for message_sync_status
CREATE POLICY "Users can read sync status"
  ON message_sync_status
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage sync status"
  ON message_sync_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to set end date for message tables
CREATE OR REPLACE FUNCTION set_message_table_end_date()
RETURNS trigger AS $$
BEGIN
  -- Set end_date to 3 months after start_date if not set
  IF NEW.end_date IS NULL THEN
    NEW.end_date := NEW.start_date + INTERVAL '3 months';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set end_date
CREATE TRIGGER set_message_table_end_date_trigger
  BEFORE INSERT OR UPDATE ON message_tables
  FOR EACH ROW
  EXECUTE FUNCTION set_message_table_end_date();

-- Function to update last message timestamp
CREATE OR REPLACE FUNCTION update_last_message_timestamp()
RETURNS trigger AS $$
BEGIN
  -- Update last_message_timestamp in message_tables
  UPDATE message_tables
  SET last_message_timestamp = NEW.timestamp
  WHERE table_name = TG_TABLE_NAME::text
  AND (last_message_timestamp IS NULL OR NEW.timestamp > last_message_timestamp);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for msgtable_1
CREATE TRIGGER update_last_message_timestamp_trigger
  AFTER INSERT ON msgtable_1
  FOR EACH ROW
  EXECUTE FUNCTION update_last_message_timestamp();

-- Update existing message_tables records
UPDATE message_tables
SET end_date = start_date + INTERVAL '3 months'
WHERE end_date IS NULL;