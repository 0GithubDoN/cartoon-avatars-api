/**
 * Avatar API Server
 * 
 * Express.js HTTP server that serves random avatars from GitHub repository.
 * 
 * Features:
 * - GET /avatar - Returns a random avatar PNG
 * - GET /health - Returns API health status
 * - GET /docs - Returns API documentation
 * - In-memory cache with periodic refresh (every 5 minutes)
 * 
 * Requirements: 5.1, 6.1, 6.4
 */

import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { getAvatarList } from './GitHubClient.js';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3000;
const CACHE_REFRESH_INTERVAL = parseInt(process.env.CACHE_REFRESH_INTERVAL) || 300000; // 5 minutes

/**
 * Get GitHub repository from environment
 * @returns {string} GitHub repository in format "owner/repo"
 */
function getGitHubRepo() {
  return process.env.GITHUB_REPO;
}

// Avatar cache
let avatarCache = {
  avatars: [],
  lastRefresh: null,
  refreshing: false
};

// MCP tool reference (to be injected)
let mcpGetFileContents = null;

/**
 * Set the MCP tool for getting file contents
 * This allows dependency injection for testing and production use
 * 
 * @param {Function} mcpTool - The mcp_github_get_file_contents tool
 */
export function setMcpTool(mcpTool) {
  mcpGetFileContents = mcpTool;
}

/**
 * Load avatar list from GitHub repository
 * Uses GitHubClient.getAvatarList() to fetch available avatars
 * 
 * @returns {Promise<Array<{filename: string, url: string, path: string}>>}
 */
async function loadAvatarList() {
  try {
    console.log(`[${new Date().toISOString()}] Loading avatar list from GitHub...`);
    
    // Use injected MCP tool or throw error if not configured
    if (!mcpGetFileContents) {
      throw new Error('MCP tool not configured. Call setMcpTool() before starting server.');
    }
    
    const githubRepo = getGitHubRepo();
    if (!githubRepo) {
      throw new Error('GITHUB_REPO environment variable is required');
    }
    
    const avatars = await getAvatarList(githubRepo, mcpGetFileContents);
    
    console.log(`[${new Date().toISOString()}] Loaded ${avatars.length} avatars from GitHub`);
    
    return avatars;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to load avatar list:`, error.message);
    throw error;
  }
}

/**
 * Refresh the avatar cache
 * Updates the in-memory cache with the latest avatar list from GitHub
 */
async function refreshCache() {
  // Prevent concurrent refresh operations
  if (avatarCache.refreshing) {
    console.log(`[${new Date().toISOString()}] Cache refresh already in progress, skipping`);
    return;
  }
  
  avatarCache.refreshing = true;
  
  try {
    const avatars = await loadAvatarList();
    
    // Update cache
    avatarCache.avatars = avatars;
    avatarCache.lastRefresh = new Date().toISOString();
    
    console.log(`[${new Date().toISOString()}] Cache refreshed successfully. ${avatars.length} avatars available.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cache refresh failed:`, error.message);
    // Keep serving from stale cache if refresh fails
  } finally {
    avatarCache.refreshing = false;
  }
}

/**
 * Initialize the avatar cache on server startup
 */
async function initializeCache() {
  console.log(`[${new Date().toISOString()}] Initializing avatar cache...`);
  
  try {
    await refreshCache();
    
    // Set up periodic cache refresh
    setInterval(refreshCache, CACHE_REFRESH_INTERVAL);
    
    console.log(`[${new Date().toISOString()}] Cache initialized. Refresh interval: ${CACHE_REFRESH_INTERVAL}ms`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to initialize cache:`, error.message);
    throw error;
  }
}

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());

// TODO: Add CORS middleware if needed
// app.use(cors());

// Routes

/**
 * GET /avatar - Return a random avatar PNG
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.2, 7.1
 */
app.get('/avatar', async (req, res) => {
  try {
    // Check if avatars are available
    if (!avatarCache.avatars || avatarCache.avatars.length === 0) {
      console.error(`[${new Date().toISOString()}] No avatars available in cache`);
      return res.status(503).json({
        error: 'No avatars available',
        code: 'NO_AVATARS',
        timestamp: new Date().toISOString()
      });
    }
    
    // Select random avatar using crypto.randomInt for cryptographic security
    const randomIndex = crypto.randomInt(0, avatarCache.avatars.length);
    const selectedAvatar = avatarCache.avatars[randomIndex];
    
    console.log(`[${new Date().toISOString()}] Selected avatar: ${selectedAvatar.filename} (index ${randomIndex} of ${avatarCache.avatars.length})`);
    
    // Fetch avatar from GitHub with retry logic
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(selectedAvatar.url);
        
        if (!response.ok) {
          throw new Error(`GitHub returned status ${response.status}`);
        }
        
        const imageBuffer = await response.arrayBuffer();
        
        // Return PNG with correct content-type header
        res.set('Content-Type', 'image/png');
        res.send(Buffer.from(imageBuffer));
        return;
      } catch (error) {
        lastError = error;
        console.error(`[${new Date().toISOString()}] Fetch attempt ${attempt} failed for ${selectedAvatar.filename}:`, error.message);
        
        // If not the last attempt, wait with exponential backoff
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 100; // 200ms, 400ms
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    // All retries exhausted
    console.error(`[${new Date().toISOString()}] Failed to fetch avatar after ${maxRetries} attempts:`, lastError.message);
    res.status(500).json({
      error: 'Failed to fetch avatar',
      code: 'FETCH_FAILED',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in /avatar endpoint:`, error.message);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /health - Return API health status
 * Requirements: 6.3
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    avatarCount: avatarCache.avatars ? avatarCache.avatars.length : 0,
    lastRefresh: avatarCache.lastRefresh
  });
});

/**
 * GET /docs - Return API documentation
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
app.get('/docs', (req, res) => {
  const baseUrl = `http://localhost:${PORT}`;
  
  res.json({
    baseUrl,
    endpoints: [
      {
        path: '/avatar',
        method: 'GET',
        description: 'Returns a random avatar PNG image',
        response: {
          contentType: 'image/png',
          example: '(binary PNG data)'
        },
        errors: [
          {
            status: 503,
            code: 'NO_AVATARS',
            description: 'No avatars available in repository'
          },
          {
            status: 500,
            code: 'FETCH_FAILED',
            description: 'Failed to fetch avatar from GitHub'
          }
        ]
      },
      {
        path: '/health',
        method: 'GET',
        description: 'Returns API health status and avatar count',
        response: {
          contentType: 'application/json',
          example: {
            status: 'ok',
            avatarCount: 150,
            lastRefresh: '2024-01-15T10:30:00Z'
          }
        }
      },
      {
        path: '/docs',
        method: 'GET',
        description: 'Returns API documentation in JSON format',
        response: {
          contentType: 'application/json',
          example: '(this document)'
        }
      }
    ],
    rateLimit: 'No rate limit currently enforced',
    usage: 'GET /avatar to receive a random avatar image. Use /health to check API status.',
    exampleRequests: [
      {
        description: 'Get a random avatar',
        curl: `curl ${baseUrl}/avatar -o avatar.png`
      },
      {
        description: 'Check API health',
        curl: `curl ${baseUrl}/health`
      },
      {
        description: 'View documentation',
        curl: `curl ${baseUrl}/docs`
      }
    ]
  });
});

// Server instance
let server = null;

/**
 * Start the Express server
 */
async function startServer() {
  try {
    // Validate configuration
    const githubRepo = getGitHubRepo();
    if (!githubRepo) {
      throw new Error('GITHUB_REPO environment variable is required');
    }
    
    console.log(`[${new Date().toISOString()}] Starting Avatar API server...`);
    console.log(`[${new Date().toISOString()}] Configuration:`);
    console.log(`  - Port: ${PORT}`);
    console.log(`  - GitHub Repository: ${githubRepo}`);
    console.log(`  - Cache Refresh Interval: ${CACHE_REFRESH_INTERVAL}ms`);
    
    // Initialize cache before starting server
    await initializeCache();
    
    // Start listening
    server = app.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Avatar API server listening on port ${PORT}`);
      console.log(`[${new Date().toISOString()}] Available endpoints:`);
      console.log(`  - GET http://localhost:${PORT}/avatar`);
      console.log(`  - GET http://localhost:${PORT}/health`);
      console.log(`  - GET http://localhost:${PORT}/docs`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error(`[${new Date().toISOString()}] Server error:`, error.message);
      process.exit(1);
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to start server:`, error.message);
    process.exit(1);
  }
}

/**
 * Gracefully shutdown the server
 */
async function shutdownServer() {
  console.log(`[${new Date().toISOString()}] Shutting down server...`);
  
  if (server) {
    server.close(() => {
      console.log(`[${new Date().toISOString()}] Server closed`);
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error(`[${new Date().toISOString()}] Forced shutdown after timeout`);
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdownServer);
process.on('SIGINT', shutdownServer);

// Start server if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

// Export for testing
export {
  app,
  startServer,
  shutdownServer,
  loadAvatarList,
  refreshCache,
  initializeCache,
  avatarCache
};
