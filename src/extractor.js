#!/usr/bin/env node

/**
 * Avatar Extraction Script
 * 
 * Extracts avatar PNG images from Figma and uploads them to GitHub.
 * 
 * Usage:
 *   node src/extractor.js           # Extract all avatars
 *   node src/extractor.js --test    # Extract only 5 avatars (test mode)
 * 
 * Environment Variables:
 *   FIGMA_FILE_URL      - Full Figma file URL
 *   FIGMA_ACCESS_TOKEN  - Figma API access token
 *   GITHUB_REPO         - GitHub repository (format: "owner/repo")
 *   GITHUB_TOKEN        - GitHub personal access token
 * 
 * Requirements: 1.3, 1.5, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3
 */

import dotenv from 'dotenv';
import { getFigmaNodes, exportNodeAsPNG } from './FigmaClient.js';
import { uploadToGitHub } from './GitHubClient.js';
import { RateLimiter } from './RateLimiter.js';

// Load environment variables
dotenv.config();

/**
 * Format timestamp for logging
 * @returns {string} ISO timestamp
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Log message with timestamp
 * @param {string} level - Log level (info, error, warning)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
function log(level, message, data = {}) {
  const logEntry = {
    timestamp: timestamp(),
    level,
    message,
    ...data
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Parse command-line arguments
 * @returns {{testMode: boolean}}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    testMode: args.includes('--test')
  };
}

/**
 * Load and validate configuration from environment variables
 * @returns {{figmaFileUrl: string, figmaAccessToken: string, githubRepo: string, githubToken: string}}
 * @throws {Error} If required environment variables are missing
 */
function loadConfig() {
  const required = ['FIGMA_FILE_URL', 'FIGMA_ACCESS_TOKEN', 'GITHUB_REPO', 'GITHUB_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    figmaFileUrl: process.env.FIGMA_FILE_URL,
    figmaAccessToken: process.env.FIGMA_ACCESS_TOKEN,
    githubRepo: process.env.GITHUB_REPO,
    githubToken: process.env.GITHUB_TOKEN
  };
}

/**
 * Mock MCP tool for Figma metadata
 * In production, this would be replaced with actual MCP tool
 */
async function mockFigmaMetadataTool(params) {
  // This is a placeholder - in real usage, the MCP tool would be injected
  throw new Error('MCP tool not injected. This script requires MCP tool integration.');
}

/**
 * Mock MCP tool for Figma screenshot
 * In production, this would be replaced with actual MCP tool
 */
async function mockFigmaScreenshotTool(params) {
  // This is a placeholder - in real usage, the MCP tool would be injected
  throw new Error('MCP tool not injected. This script requires MCP tool integration.');
}

/**
 * Mock MCP tool for GitHub file upload
 * In production, this would be replaced with actual MCP tool
 */
async function mockGitHubUploadTool(params) {
  // This is a placeholder - in real usage, the MCP tool would be injected
  throw new Error('MCP tool not injected. This script requires MCP tool integration.');
}

/**
 * Extract avatars from Figma and upload to GitHub
 * @param {Object} config - Configuration object
 * @param {boolean} testMode - If true, extract only 5 avatars
 * @param {Object} mcpTools - MCP tool functions
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
async function extractAvatars(config, testMode, mcpTools) {
  const { figmaFileUrl, githubRepo } = config;
  const { figmaMetadata, figmaScreenshot, githubUpload } = mcpTools;
  
  // Initialize rate limiter: 1 request per second, max 1 concurrent
  const rateLimiter = new RateLimiter(1, 1);
  
  // Track results
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Step 1: Discover avatar nodes
    log('info', 'Starting avatar discovery', { figmaFileUrl, testMode });
    
    const nodes = await rateLimiter.execute(async () => {
      return await getFigmaNodes(figmaFileUrl, figmaMetadata);
    });
    
    log('info', 'Avatar nodes discovered', { count: nodes.length });
    
    // Step 2: Limit to 5 avatars in test mode
    const nodesToProcess = testMode ? nodes.slice(0, 5) : nodes;
    
    if (testMode) {
      log('info', 'Test mode enabled', { limit: 5, processing: nodesToProcess.length });
    }
    
    // Step 3: Process each node
    for (let i = 0; i < nodesToProcess.length; i++) {
      const node = nodesToProcess[i];
      const progress = `${i + 1}/${nodesToProcess.length}`;
      
      try {
        log('info', 'Processing avatar', { 
          nodeId: node.id, 
          nodeName: node.name, 
          progress 
        });
        
        // Export node as PNG (with rate limiting)
        const pngBuffer = await rateLimiter.execute(async () => {
          return await exportNodeAsPNG(figmaFileUrl, node.id, figmaScreenshot);
        });
        
        log('info', 'Avatar exported', { 
          nodeId: node.id, 
          size: pngBuffer.length 
        });
        
        // Upload to GitHub (with rate limiting)
        const uploadResult = await rateLimiter.execute(async () => {
          return await uploadToGitHub(
            githubRepo,
            node.id,
            pngBuffer,
            githubUpload,
            { branch: 'main', maxRetries: 3 }
          );
        });
        
        log('info', 'Avatar uploaded', { 
          nodeId: node.id, 
          filename: uploadResult.filename,
          url: uploadResult.url
        });
        
        results.success++;
        
      } catch (error) {
        // Log error and continue processing
        log('error', 'Failed to process avatar', {
          nodeId: node.id,
          nodeName: node.name,
          error: error.message,
          stack: error.stack
        });
        
        results.failed++;
        results.errors.push({
          nodeId: node.id,
          nodeName: node.name,
          error: error.message
        });
      }
    }
    
  } catch (error) {
    // Fatal error during discovery
    log('error', 'Fatal error during extraction', {
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
  
  return results;
}

/**
 * Generate final report
 * @param {Object} results - Extraction results
 * @param {number} startTime - Start timestamp
 */
function generateReport(results, startTime) {
  const endTime = Date.now();
  const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
  
  log('info', 'Extraction complete', {
    success: results.success,
    failed: results.failed,
    total: results.success + results.failed,
    durationSeconds,
    successRate: results.success + results.failed > 0 
      ? ((results.success / (results.success + results.failed)) * 100).toFixed(2) + '%'
      : 'N/A'
  });
  
  if (results.errors.length > 0) {
    log('info', 'Errors encountered', {
      errorCount: results.errors.length,
      errors: results.errors
    });
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    // Parse command-line arguments
    const { testMode } = parseArgs();
    
    // Load configuration
    log('info', 'Loading configuration');
    const config = loadConfig();
    
    // Note: In production, MCP tools would be injected here
    // For now, we use mock tools that will throw errors
    const mcpTools = {
      figmaMetadata: mockFigmaMetadataTool,
      figmaScreenshot: mockFigmaScreenshotTool,
      githubUpload: mockGitHubUploadTool
    };
    
    // Run extraction
    const results = await extractAvatars(config, testMode, mcpTools);
    
    // Generate final report
    generateReport(results, startTime);
    
    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);
    
  } catch (error) {
    log('error', 'Extraction failed', {
      error: error.message,
      stack: error.stack
    });
    
    process.exit(1);
  }
}

// Export for testing
export {
  parseArgs,
  loadConfig,
  extractAvatars,
  generateReport,
  log,
  timestamp
};

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
