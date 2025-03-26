require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parse');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service_role key
);

async function importUsers(filePath) {
  const records = [];
  const parser = fs
    .createReadStream(filePath)
    .pipe(csv.parse({
      columns: true,
      skip_empty_lines: true
    }));

  for await (const record of parser) {
    records.push({
      phone_number: record.phone_number,
      name: record.name || null,
      created_at: new Date().toISOString()
    });

    // Process in batches of 50
    if (records.length === 50) {
      await insertUserBatch(records);
      records.length = 0;
    }
  }

  // Insert any remaining records
  if (records.length > 0) {
    await insertUserBatch(records);
  }
}

async function insertUserBatch(users) {
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert(users, {
        onConflict: 'phone_number',
        ignoreDuplicates: true
      });

    if (error) {
      console.error('Error inserting batch:', error);
      return;
    }

    console.log(`Successfully processed ${users.length} users`);
  } catch (error) {
    console.error('Error in batch insert:', error);
  }
}

// Check if file path is provided
const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide the path to the CSV file');
  process.exit(1);
}

// Start import
console.log(`Importing users from ${filePath}`);
importUsers(filePath)
  .then(() => {
    console.log('Import completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });