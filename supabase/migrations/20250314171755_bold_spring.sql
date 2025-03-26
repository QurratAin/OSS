/*
  # WhatsApp Analyzer Complete Schema

  This is the initial schema setup for the WhatsApp Analyzer application.
  It includes all necessary tables, functions, and security policies.

  1. Tables
    - users: Store user information
    - auth_codes: Manage OTP authentication
    - message_tables: Track message partitions
    - msgtable_1: Initial message table
    - business_analysis: Store message analysis results

  2. Functions
    - create_message_table: Create new message tables
    - get_message_table: Get appropriate table for timestamp
    - trigger_message_analysis: Handle message analysis

  3. Security
    - Row Level Security (RLS) enabled on all tables
    - Read-only policies for authenticated users
    - Service role policies for data insertion
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text UNIQUE NOT NULL,
  name text,
  created_at timestamptz DEFAULT now()
);

-- Authentication codes table for OTP
CREATE TABLE IF NOT EXISTS auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Base messages table (for inheritance)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  timestamp timestamptz NOT NULL,
  author text NOT NULL,
  group_id text NOT NULL,
  user_id uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- Table to track message partitions
CREATE TABLE IF NOT EXISTS message_tables (
  id SERIAL PRIMARY KEY,
  table_name text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Initial message table
CREATE TABLE IF NOT EXISTS msgtable_1 (
  LIKE messages INCLUDING ALL
) INHERITS (messages);

-- Business analysis table
CREATE TABLE IF NOT EXISTS business_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_period_start timestamptz NOT NULL,
  analysis_period_end timestamptz NOT NULL,
  analysis_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_auth_codes_phone ON auth_codes(phone_number);
CREATE INDEX IF NOT EXISTS idx_msgtable_1_timestamp ON msgtable_1(timestamp);
CREATE INDEX IF NOT EXISTS idx_business_analysis_period ON business_analysis(analysis_period_start, analysis_period_end);
CREATE INDEX IF NOT EXISTS idx_business_analysis_gin ON business_analysis USING gin(analysis_data);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE msgtable_1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_analysis ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read group member data"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

-- Auth codes policies
CREATE POLICY "Service role can manage auth codes"
  ON auth_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Message tables policies
CREATE POLICY "Users can read message tables metadata"
  ON message_tables
  FOR SELECT
  TO authenticated
  USING (true);

-- Messages policies
CREATE POLICY "Users can read messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert messages"
  ON messages
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Initial message table policies
CREATE POLICY "Users can read messages from msgtable_1"
  ON msgtable_1
  FOR SELECT
  TO authenticated
  USING (true);

-- Business analysis policies
CREATE POLICY "Users can read business analysis"
  ON business_analysis
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert business analysis"
  ON business_analysis
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Function to create new message table
CREATE OR REPLACE FUNCTION create_message_table(table_number int, start_timestamp timestamptz)
RETURNS void AS $$
DECLARE
  new_table_name text;
BEGIN
  -- Generate table name
  new_table_name := 'msgtable_' || table_number;
  
  -- Create the new table
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      LIKE messages INCLUDING ALL
    ) INHERITS (messages);
    
    CREATE INDEX IF NOT EXISTS %I ON %I(timestamp);
    
    ALTER TABLE %I ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can read messages from %I"
      ON %I
      FOR SELECT
      TO authenticated
      USING (true);
  ', 
  new_table_name, 
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
END;
$$ LANGUAGE plpgsql;

-- Function to get appropriate table for a timestamp
CREATE OR REPLACE FUNCTION get_message_table(msg_timestamp timestamptz)
RETURNS text AS $$
DECLARE
  target_table text;
BEGIN
  -- Get the appropriate table
  SELECT table_name INTO target_table
  FROM message_tables
  WHERE (end_date IS NULL OR msg_timestamp < end_date)
    AND msg_timestamp >= start_date
  ORDER BY start_date DESC
  LIMIT 1;
  
  RETURN target_table;
END;
$$ LANGUAGE plpgsql;

-- Function to trigger analysis after message batch
CREATE OR REPLACE FUNCTION trigger_message_analysis()
RETURNS trigger AS $$
BEGIN
  -- Trigger analysis only when a batch of messages is inserted
  -- This will be handled by the application layer
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Insert first table record with start date
INSERT INTO message_tables (table_name, start_date)
VALUES ('msgtable_1', '2025-02-15'::timestamptz)
ON CONFLICT DO NOTHING;

-- Set session configuration
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30min';
ALTER ROLE authenticated SET idle_session_timeout = '30min';