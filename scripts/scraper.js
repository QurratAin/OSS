require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const { analyzeAllMessages } = require('../lib/analysis.js');

// Initialize Supabase client with service role key for elevated permissions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize WhatsApp client with more robust configuration
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  }
});

async function findGroupByName(groupName) {
  try {
    const chats = await client.getChats();

    console.log('Looking for group:', groupName);
    const group = chats.find(chat => {
      const isGroup = chat.id.server === 'g.us'; // Check if it's a group
      return isGroup && chat.name.trim().toLowerCase() === groupName.trim().toLowerCase();
    });

    if (group) {
      console.log('Group found:', group.name);
      return group;
    } else {
      console.log('Group not found!');
      return null;
    }
  } catch (error) {
    console.error('Error finding group:', error);
    return null;
  }
}

// Get or create user by phone number and update name if needed
async function getOrCreateUser(phoneNumber, userName = null) {
  
  try {
    if (!phoneNumber) {
      console.error('Phone number is required');
      return null;
    }

    // First try to find existing user
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, name')
      .eq('phone_number', phoneNumber)
      .single();

    if (existingUser) {
      // If user exists but has no name and we have a new name
      if (!existingUser.name && userName) {
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ name: userName })
          .eq('id', existingUser.id)
          .select('id')
          .single();

        if (updateError) {
          console.error('Error updating user name:', updateError);
        }
        return existingUser.id;
      }
      return existingUser.id;
    }

    // If user doesn't exist, create new user with both phone number and name
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        phone_number: phoneNumber,
        name: userName,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return null;
    }

    return newUser.id;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    return null;
  }
}

// Store messages in appropriate table
async function storeMessage(message, chat_name) {
  try {
    // Validate message
    if (!message?.body) {
      console.error('Invalid message: missing content');
      return;
    }

    // get detail of sender
    con = await message.getContact();
    const userId = await getOrCreateUser(con.number, con.pushname);
    if (!userId) {
      console.error('Failed to get or create user');
      return;
    }

    const timestamp = new Date(message.timestamp * 1000).toISOString();
    
    // Check if we need a new table
    await checkAndCreateMessageTable(timestamp);
    
    // Get appropriate table name
    const { data: tableName, error: tableError } = await supabase.rpc('get_message_table', {
      msg_timestamp: timestamp
    });
    
    if (tableError || !tableName) {
      console.error('Could not determine target table for message:', tableError);
      return;
    }

    // Store the message
    const { error } = await supabase
      .from(tableName)
      .insert({
        content: message.body.trim(), // Sanitize content
        timestamp: timestamp,
        user_id: userId,
        group_id: chat_name
      });

    if (error) {
      console.error('Error storing message:', error);
    }
  } catch (error) {
    console.error('Error in storeMessage:', error);
  }
}

// Check if we need to create a new message table
async function checkAndCreateMessageTable(timestamp) {
  try {
    if (!timestamp) {
      console.error('Timestamp is required');
      return;
    }

    // Get current table info
    const { data: currentTable, error } = await supabase
      .from('message_tables')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching current table:', error);
      return;
    }

    if (!currentTable) return;

    const tableStartDate = new Date(currentTable.start_date);
    const messageDate = new Date(timestamp);
    
    // If more than 3 months have passed since table start
    if (messageDate.getTime() - tableStartDate.getTime() > 90 * 24 * 60 * 60 * 1000) {
      const tableNumber = parseInt(currentTable.table_name.split('_')[1]) + 1;
      
      // Create new table using database function
      const { error: createError } = await supabase.rpc('create_message_table', {
        table_number: tableNumber,
        start_timestamp: messageDate.toISOString()
      });

      if (createError) {
        console.error('Error creating new message table:', createError);
        return;
      }
      
      console.log(`Created new message table: msgtable_${tableNumber}`);
    }
  } catch (error) {
    console.error('Error checking/creating message table:', error);
  }
}

async function getLastMessages(groupChat) {
  try {
    if (!groupChat?.id) {
      console.error('Invalid group chat');
      return [];
    }

    // Get last sync timestamp from Supabase
    const { data: syncStatus } = await supabase
      .from('message_sync_status')
      .select('last_sync_timestamp')
      .eq('group_id', groupChat.name)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const startDate = syncStatus?.last_sync_timestamp
      ? new Date(syncStatus.last_sync_timestamp)
      : new Date(0); // If no sync status, fetch all messages

    if (!syncStatus) {
      console.log('No sync status found, fetching all available messages');
    }

    console.log(`Fetching messages for group: ${groupChat.name} since: ${startDate.toLocaleString()}`);
    const FETCH_LIMIT = 4000;
    filteredMessages = null;
    try {
        const messages = await groupChat.fetchMessages({
          fromMe: undefined,
          limit: FETCH_LIMIT});

        // Filter messages newer than the last sync date
        filteredMessages = messages.filter(msg => {
          const msgDate = new Date(msg.timestamp * 1000); // Convert seconds to milliseconds
          return msgDate > startDate;
        });

        console.log(`Fetched batch of ${messages.length} messages and filtered to ${filteredMessages.length}`);

      } catch (error) {
        console.error('Error fetching batch:', error);
    }
  
    return filteredMessages;
  } catch (error) {
    console.error('Error in getLastMessages:', error.message || error);
    return [];
  }
}


// Handle session management
let sessionCheckInterval;
let isAuthenticated = false;

function startSessionCheck() {
  sessionCheckInterval = setInterval(async () => {
    try {
      const state = await client.getState();
      if (state !== 'CONNECTED' && isAuthenticated) {
        console.log('Session expired or disconnected. Reinitializing...');
        await client.destroy();
        await client.initialize();
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
  }, 30000); // Check every 30 seconds
}

client.on('qr', (qr) => {
  console.log('QR Code received. Scan with WhatsApp to login:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('Client authenticated');
  isAuthenticated = true;
  startSessionCheck();
});

client.on('auth_failure', () => {
  console.error('Authentication failed! Please scan the QR code again.');
  isAuthenticated = false;
});

client.on('disconnected', async (reason) => {
  console.log('Client disconnected:', reason);
  isAuthenticated = false;
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  
  // Attempt to reconnect
  try {
    await client.initialize();
  } catch (error) {
    console.error('Failed to reinitialize client:', error);
    process.exit(1);
  }
});

client.on('ready', async () => {
  console.log('Client is ready!');
  
  try {
     // Wait for chats to load
  await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay

    // Get the target group chat by name
    const groupName = process.env.WHATSAPP_GROUP_NAME;
    if (!groupName) {
      throw new Error('WHATSAPP_GROUP_NAME environment variable is not set');
    }

    const chat = await findGroupByName(groupName);
    
    if (!chat) {
      throw new Error('Group not found! Please check the group name.');
    }
    
    const messages = await getLastMessages(chat);
    
    if (messages.length > 0) {
      console.log('Storing messages...');
      for (const message of messages) {
        await storeMessage(message, chat.name);
      }
      console.log('Messages stored successfully!');

      // Analyze stored messages
      console.log('Analyzing messages...');
      await analyzeAllMessages();
      console.log('Analysis completed successfully!');
    } else {
      console.log('No new messages to process');
    }
    
    // Clean up and exit
    await client.destroy();
    if (sessionCheckInterval) {
      clearInterval(sessionCheckInterval);
    }
    process.exit(0);
  } catch (error) {
    console.error('Error in main process:', error);
    await client.destroy();
    process.exit(1);
  }
});

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  await client.destroy();
  process.exit(0);
});

client.initialize();