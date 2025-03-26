const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');

const BATCHSIZE = 500;
// Initialize Supabase client with service role key for elevated permissions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize DeepSeek client
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com/v1'
});

// Validate message format
function validateMessage(message) {
  return message 
    && typeof message.timestamp !== 'undefined'
    && typeof message.user_id !== 'undefined'
    && typeof message.content === 'string'
    && message.content.trim().length > 0;
}

// Format messages for analysis with validation
function formatMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Invalid or empty messages array');
  }

  return messages
    .filter(validateMessage)
    .map(msg => {
      const timestamp = new Date(msg.timestamp).toISOString();
      return `${timestamp}, ${msg.user_id}: ${msg.content.trim()}`;
    })
    .join('\n');
}

// Get previous analysis with error handling
async function getPreviousAnalysis() {
  try {
    const { data, error } = await supabase
      .from('business_analysis')
      .select('analysis_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching previous analysis:', error);
      return {};
    }

    return data?.analysis_data || {};
  } catch (error) {
    console.error('Error in getPreviousAnalysis:', error);
    return {};
  }
}

// Get messages since last sync
async function analyzeAllMessages() {
  try {
    // Get last sync timestamp
    const { data: syncStatus } = await supabase
      .from('message_sync_status')
      .select('last_sync_timestamp')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const startDate = syncStatus?.last_sync_timestamp || new Date(0).toISOString();

    // Get the appropriate table name for the start date
    const { data: tableName, error: tableError } = await supabase.rpc('get_message_table', {
      msg_timestamp: startDate
    });

    if (tableError || !tableName) {
      console.error('Could not determine target table:', tableError);
      return false;
    }
    console.log(`Fetching msg from table ${tableName} from ${startDate}`);

    // Query messages from the specific table
    let from = 0;
    while (true){
      const { data: messages, error } = await supabase
        .from(tableName)
        .select('content, timestamp, user_id, group_id')
        .order('timestamp', { ascending: true })
        .gt('timestamp', startDate)
        .range(from, from + BATCHSIZE - 1); // Fetch rows in batches;

      if (error) {
        console.error('Error fetching messages:', error);
        return false;
      }

      if (!messages || messages.length === 0) {
        break; // No more rows to fetch
      }
      await analyzeBatch(messages, messages[0].group_id);

      from += BATCHSIZE;
    }
    return true;
  } catch (error) {
    console.error('Error in getMessagesForAnalysis:', error);
    return false;
  }
}

async function getUserDetails(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('name, phone_number')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user details:', error);
    return null;
  }

  return data;
}

 // Helper function to process each message entry
 async function processEntry(entry) {
  const [timestampUserId, message] = Object.entries(entry)[0];
  const [timestamp, userId] = timestampUserId.split(': ');
  const userDetails = await getUserDetails(userId.trim());
  if (userDetails) {
    const newKey = `${timestamp}: ${userDetails.name} (${userDetails.phone_number})`;
    return { [newKey]: message };
  } else {
    return { [timestampUserId]: message };
  }
}

// Replace user IDs with user information in analysis results
async function replaceUserInfo(jsonData) {
  // Iterate over each service in the JSON data
  for (const buscat in jsonData) {
    const cat = jsonData[buscat];

    for (const serviceName in cat) {
      const service = cat[serviceName];

      // Process Recommendations (Positive and Negative) and Suggestions
      const sections = ['Positive', 'Negative', 'Suggestions'];
      for (const section of sections) {
        if (service.Recommendations && service.Recommendations[section]) {
          const entries = service.Recommendations[section];
          const newEntries = {};

          for (const key in entries) {
            const newEntry = await processEntry({ [key]: entries[key] });
            Object.assign(newEntries, newEntry);
          }

          service.Recommendations[section] = newEntries;
        } else if (service[section]) {
          const entries = service[section];
          const newEntries = {};

          for (const key in entries) {
            const newEntry = await processEntry({ [key]: entries[key] });
            Object.assign(newEntries, newEntry);
          }

          service[section] = newEntries;
        }
      }
    }
  }

  return jsonData; 
}

// System message template for the model
const SYSTEM_PROMPT = `You are an expert business intelligence assistant analyzing WhatsApp group chat conversations.

INPUT FORMAT:
Each message follows the format: "timestamp, user_id: message_content"

TASK:
Analyze messages for business, service, product recommendations and suggestions, categorizing them by business 
categories given below. The main task is to get the highly rated products and services with their busniess information. 
Do not add the messages which are asking for recommendations or suggestions. Always include full message not a part of it.
Follow the analysis rules.

ANALYSIS RULES:

1. Message Classification:
   - Strickly look for brand and names products, services, busniesses. 
   - Recommendations: Personal experiences with services/products
     * Categorize as Positive or Negative
     * Include complete message content
     * Preserve unique user experiences
   - Suggestions: Recommendations without personal experience
     * Cannot be categorized as positive/negative
     * Include complete message content

2. Business Information Collection:
   - Website links
   - Contact Phone numbers
   - Email addresses
   - Physical addresses
   - Facebook link or Instagram links
   - when any of these information is found in the msg put it under BusniessInfo

3. Exclusion Criteria:
   - Exculde general products e.g. buy soap, unless their is mention of particular brand of soap
   - Requests for recommendations e.g. Is fitness Valley the best gym? or Any recommendation for vacation plans? Exclude such comments.
   - Generic advice (e.g., "do yoga", "go to gym")
   - Thank you messages
   - General gratitude expressions

BUSINESS CATEGORIES:

1. Food and Beverage
   - Home cooked food, catering, baking, cooking services, etc.

2. Retail Services
   - Clothing, apparel, jewelry, home decor, tailoring, etc

3. Beauty and Personal Care
   - Salons, spas, beauty clinics, personal care products, etc

4. Fitness and Wellness
   - Gyms, yoga, nutritionists, personal trainers, coaches, etc

5. Legal and Financial Services
   - Legal, financial planning, investment, tax services, etc

6. Home Services
   - Cleaning, repairs, construction, maintenance, renovation, gardening etc

7. Spirtual and Holistic Services
   - Astrology, spiritual coaching, alternative therapies, etc

8. Digital Marketing
   - Marketing, content creation, social media management, etc

9. Child Services
   - Education, tutoring, activities, childcare, etc

10. Travel and Event Planning Services
    - Trip planning, travel agencies, event organization, etc

11. Adult Learning and Fun Activities
    - Classes, workshops, skill development, etc

12. Professional HealthCare
    - Medical, dental, therapy, specialized care, etc

13. Miscellaneous
    - Other business services not fitting above categories

OUTPUT FORMAT:
{
  "Business Category": {
    "Service Name": {
      "BusinessInfo": {
        "Insta": "",
        "Facebook": "", 
        "phone": "",
        "email": "",
        "address": "",
        "Site": ""
      },
      "Recommendations": {
        "Positive": {
          "(timestamp): user_id": "message",
          "(timestamp): user_id": "message"
        },
        "Negative": {
          "(timestamp): user_id": "message"
        }
      },
      "Suggestions": {
        "(timestamp): user_id": "message"
      }
    }
  }
}
`;

// Merge multiple analysis results
function mergeAnalysis(existing, newAnalysis) {
  // Create a deep copy of the existing object
  const merged = JSON.parse(JSON.stringify(existing));

  // Helper function to normalize keys to lowercase
  const normalizeKey = (key) => key.toLowerCase();

  // Create a map to store lowercase keys and their original keys for the existing analysis
  const existingCategoryMap = new Map();
  for (const category of Object.keys(existing)) {
    existingCategoryMap.set(normalizeKey(category), category);
  }

  for (const [category, businesses] of Object.entries(newAnalysis)) {
    // Normalize the category name for comparison
    const normalizedCategory = normalizeKey(category);

    // Find the original category key in the existing analysis (if it exists)
    const originalCategory = existingCategoryMap.get(normalizedCategory) || category;

    // Initialize the category in the merged object if it doesn't exist
    if (!merged[originalCategory]) {
      merged[originalCategory] = {};
    }

    // Create a map to store lowercase keys and their original keys for the businesses in the existing category
    const existingBusinessMap = new Map();
    for (const business of Object.keys(merged[originalCategory])) {
      existingBusinessMap.set(normalizeKey(business), business);
    }

    for (const [business, data] of Object.entries(businesses)) {
      // Normalize the business name for comparison
      const normalizedBusiness = normalizeKey(business);

      // Find the original business key in the existing category (if it exists)
      const originalBusiness = existingBusinessMap.get(normalizedBusiness) || business;

      // Initialize the business in the merged object if it doesn't exist
      if (!merged[originalCategory][originalBusiness]) {
        merged[originalCategory][originalBusiness] = data;
        continue;
      }

      // Merge Business Information (dictionary object)
      if (data.BusinessInfo) {
        merged[originalCategory][originalBusiness]["BusinessInfo"] = {
          ...(merged[originalCategory][originalBusiness]["BusinessInfo"] || {}),
          ...data["BusinessInfo"]
        };
      }

      // Merge Recommendations (dictionary objects for Positive and Negative)
      if (data.Recommendations) {
        for (const type of ['Positive', 'Negative']) {
          merged[originalCategory][originalBusiness].Recommendations[type] = {
            ...(merged[originalCategory][originalBusiness].Recommendations[type] || {}),
            ...(data.Recommendations[type] || {})
          };
        }
      }

      // Merge Suggestions (dictionary object)
      if (data.Suggestions) {
        merged[originalCategory][originalBusiness].Suggestions = {
          ...(merged[originalCategory][originalBusiness].Suggestions || {}),
          ...data.Suggestions
        };
      }
    }
  }

  return merged;
}

// Analyze messages
async function analyzeBatch(messages, group_name) {
  
    console.log(`batchsize is: `,messages.length);
    const formattedChat = formatMessages(messages);
    const previousAnalysis = await getPreviousAnalysis();

    // Analyze all messages in a single batch
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `Analyze this group chat for business Information, product or services recommendations and suggestions:\n${formattedChat}\n 
          The resultant json should strickly be in the instructed format.`
        }
      ],
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    analysisResult = JSON.parse(response.choices[0].message.content);
    analysisResult = await replaceUserInfo(analysisResult);
    const mergedResult = mergeAnalysis(previousAnalysis, analysisResult);
  
    
    // Store analysis result
    const { error } = await supabase
      .from('business_analysis')
      .insert({
        analysis_period_start: messages[0]?.timestamp,
        analysis_period_end: messages[messages.length - 1]?.timestamp,
        analysis_data: mergedResult,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error storing analysis:', error);
    }

    // Update last sync timestamp with the last message timestamp
    const lastMessageTimestamp = messages[messages.length - 1]?.timestamp;
    
    const { error: syncError } = await supabase
      .from('message_sync_status')
      .insert({
        last_sync_timestamp: lastMessageTimestamp,
        group_id: group_name,
        created_at: new Date().toISOString()
      });

    if (syncError) {
      console.error('Error inserting sync status:', syncError);
    }
    console.log(`Msgs analyzed till ${lastMessageTimestamp}`);

    return mergedResult;
  
}

module.exports = { analyzeAllMessages };