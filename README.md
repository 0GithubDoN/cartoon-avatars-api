# Avatar API Project

A complete avatar API system that extracts cartoon avatar PNG images from Figma, stores them in a GitHub repository, and serves them via an HTTP API. Similar to dicebear.com, this system provides a simple, reliable avatar service for your applications.

## Quick Start

1. Clone and install:
```bash
git clone https://github.com/0GithubDoN/cartoon-avatars-api.git
cd cartoon-avatars-api
npm install
```

2. Configure `.env` with your tokens
3. Test extraction: `npm run extract:test`
4. Full extraction: `npm run extract`
5. Start API: `npm start`

See full documentation below for detailed setup instructions.

---

## System Architecture

The system consists of three main components:

```
┌─────────────────┐
│  Figma Design   │
│      File       │
└────────┬────────┘
         │
         │ MCP Tools
         ▼
┌─────────────────┐
│   Extraction    │
│    Service      │◄─── Rate Limiter (1 req/sec)
│  (extractor.js) │
└────────┬────────┘
         │
         │ MCP Tools
         ▼
┌─────────────────┐
│     GitHub      │
│   Repository    │
│  (/avatars/*.png)│
└────────┬────────┘
         │
         │ GitHub API
         ▼
┌─────────────────┐
│   API Service   │◄─── Cache (5 min refresh)
│   (server.js)   │
└────────┬────────┘
         │
         │ HTTP
         ▼
┌─────────────────┐
│     Client      │
│  Applications   │
└─────────────────┘
```

### Components

1. **Extraction Service** (`src/extractor.js`)
   - Downloads avatar PNGs from Figma using MCP tools
   - Uploads avatars to GitHub repository
   - Runs once to populate the avatar collection
   - Supports test mode (5 avatars) and full extraction
   - Rate-limited to respect Figma API limits

2. **GitHub Storage**
   - Stores extracted avatars in `/avatars/` directory
   - Provides version control and public access
   - No Figma dependency after initial extraction

3. **API Service** (`src/server.js`)
   - Express.js HTTP server
   - Serves random avatars from GitHub
   - In-memory cache with periodic refresh
   - Three endpoints: `/avatar`, `/health`, `/docs`

## Setup Instructions

### Prerequisites

- Node.js v18 or higher
- Figma account with API access
- GitHub account with personal access token
- GitHub repository for storing avatars

### Installation

1. Clone the repository:
```bash
git clone https://github.com/0GithubDoN/cartoon-avatars-api.git
cd cartoon-avatars-api
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and provide your credentials:

```env
# Figma Configuration
FIGMA_ACCESS_TOKEN=your_figma_access_token_here
FIGMA_FILE_URL=https://www.figma.com/design/your-file-id/...

# GitHub Configuration
GITHUB_TOKEN=your_github_personal_access_token_here
GITHUB_REPO=0GithubDoN/cartoon-avatars-api

# API Server Configuration (optional)
PORT=3000
CACHE_REFRESH_INTERVAL=300000
```

### Getting API Tokens

**Figma Access Token:**
1. Go to https://www.figma.com/developers/api#access-tokens
2. Click "Get personal access token"
3. Copy the token to your `.env` file

**GitHub Personal Access Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control of private repositories)
4. Copy the token to your `.env` file

**Figma File URL:**
1. Open your Figma file with avatars
2. Copy the URL from the browser
3. Ensure the URL includes the node-id parameter (e.g., `?node-id=0-1`)

## Usage

### Extraction Script

The extraction script downloads avatars from Figma and uploads them to GitHub. Run this once to populate your avatar collection.

#### Test Mode (5 avatars)

Test the extraction process with a small subset:

```bash
npm run extract:test
```

Or directly:

```bash
node src/extractor.js --test
```

This will:
- Extract only 5 avatars
- Verify Figma and GitHub credentials
- Test the complete extraction pipeline
- Display progress and results

#### Full Extraction

Extract all avatars from the Figma file:

```bash
npm run extract
```

Or directly:

```bash
node src/extractor.js
```

This will:
- Discover all avatar nodes in the Figma file
- Export each avatar as PNG
- Upload to GitHub with rate limiting (1 request/second)
- Generate a final report with success/failure counts

### API Server

Start the API server to serve random avatars:

```bash
npm start
```

The server will:
1. Load the avatar list from GitHub
2. Initialize the in-memory cache
3. Start listening on the configured port (default: 3000)
4. Refresh the cache every 5 minutes

## API Endpoints

### GET /avatar

Returns a random avatar PNG image.

**Request:**
```bash
curl http://localhost:3000/avatar -o avatar.png
```

**Response:**
- Status: 200 OK
- Content-Type: `image/png`
- Body: Binary PNG data

### GET /health

Returns API health status and avatar count.

**Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "avatarCount": 150,
  "lastRefresh": "2024-01-15T10:30:00.000Z"
}
```

### GET /docs

Returns API documentation in JSON format.

**Request:**
```bash
curl http://localhost:3000/docs
```

## Testing

Run all tests:
```bash
npm test
```

Run unit tests only:
```bash
npm run test:unit
```

Run property-based tests only:
```bash
npm run test:property
```

Watch mode for development:
```bash
npm run test:watch
```

## License

MIT
