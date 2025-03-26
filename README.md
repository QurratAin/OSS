# OSS: WhatsApp Group Chat Recommendation Analyzer
A structured analytics platform for extracting and categorizing business/service recommendations from WhatsApp group chats.

## Project Overview
OSS is a static web application that systematically analyzes WhatsApp group conversations to identify and categorize business/service recommendations shared by community members. It features:
- Client-side authentication (SMS OTP via Twilio)
- Scheduled scraping (non-real-time, via WhatsApp Web integration)
- AI-powered categorization of recommendations
- Supabase-backed data persistence

Key Differentiator: Unlike real-time monitoring tools, OSS operates on a batch-processing model, updating its database during scheduled scrapes to maintain data freshness while minimizing API calls.

## Core Components
1. Data Ingestion Layer
- Node.js scraper (headless browser automation)
- WhatsApp-Web.js integration

2. Data Processing
- NLP categorization (keyword-based or LLM-enhanced)
- Entity extraction (business names, contact details)
- Supabase PostgreSQL tables with Row-Level Security (RLS)

3. Frontend
- Server Components for data fetching
- Client-side authentication flow

4. Infrastructure
- Vercel hosting (frontend)
- Supabase (PostgreSQL + Auth)
- Twilio (SMS verification)


## Prerequisites

- Node.js 18 or higher
- Supabase account
- WhatsApp account
- Twilio account (for SMS authentication)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WhatsApp Configuration
WHATSAPP_COMMUNITY_NAME="Your Community Name"
WHATSAPP_GROUP_NAME="Your Group Name"

# Twilio Configuration (Optional - for SMS auth)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=your-twilio-phone-number
```

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd oss
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   - Create a new Supabase project
   - Run the migrations from the `supabase/migrations` folder
   - Update your `.env` file with the Supabase credentials

## Usage

### Message Scraping

To scrape messages from WhatsApp:

```bash
npm run scrape
```

This will:
- Connect to WhatsApp Web (first time requires QR code scan)
- Fetch messages from the specified group
- Store messages in the database
- Process all new messages since the last analysis
- Categorize business recommendations
- Extract business information
- Store results in the database

## Database Schema

The project uses several tables:

- `users`: Store user information
- `messages`: Store WhatsApp messages (partitioned by date)
- `business_analysis`: Store analysis results
- `message_sync_status`: Track message synchronization
- `auth_codes`: Manage authentication


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
