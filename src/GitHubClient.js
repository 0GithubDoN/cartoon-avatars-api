/**
 * GitHub Client Wrapper
 * 
 * Provides methods to interact with GitHub API via MCP tools:
 * - uploadToGitHub: Upload avatar PNG files to GitHub repository
 * - getAvatarList: Retrieve list of avatar files from repository
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

/**
 * Parse GitHub repository string into owner and repo
 * @param {string} repoString - Format: "owner/repo"
 * @returns {{owner: string, repo: string}}
 */
function parseRepoString(repoString) {
  const parts = repoString.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid repository format. Expected: "owner/repo"');
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Generate unique filename based on Figma node ID
 * @param {string} nodeId - Figma node ID (e.g., "83:350")
 * @returns {string} Filename (e.g., "avatar-83-350.png")
 */
export function generateFilename(nodeId) {
  // Replace colons with hyphens for filesystem compatibility
  const sanitized = nodeId.replace(/:/g, '-');
  return `avatar-${sanitized}.png`;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload a PNG file to GitHub repository with retry logic
 * Uses mcp_github_create_or_update_file to upload the file
 * 
 * @param {string} repoString - Repository in format "owner/repo"
 * @param {string} nodeId - Figma node ID for filename generation
 * @param {Buffer} content - PNG image data as Buffer
 * @param {Function} mcpTool - MCP tool function (mcp_github_create_or_update_file)
 * @param {Object} options - Upload options
 * @param {string} options.branch - Branch to upload to (default: 'main')
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<{success: boolean, url: string, filename: string}>}
 * @throws {Error} If authentication fails or max retries exceeded
 */
export async function uploadToGitHub(repoString, nodeId, content, mcpTool, options = {}) {
  const { branch = 'main', maxRetries = 3 } = options;
  const { owner, repo } = parseRepoString(repoString);
  const filename = generateFilename(nodeId);
  const path = `avatars/${filename}`;
  
  // Convert Buffer to base64 string for GitHub API
  const base64Content = content.toString('base64');
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Call MCP tool to create or update file
      const result = await mcpTool({
        owner,
        repo,
        path,
        content: base64Content,
        message: `Add avatar ${filename}`,
        branch
      });
      
      // Check for authentication errors (don't retry these)
      if (result.error) {
        if (result.error.includes('auth') || result.error.includes('401') || result.error.includes('403')) {
          throw new Error(`GitHub authentication failed: ${result.error}`);
        }
        throw new Error(`GitHub API error: ${result.error}`);
      }
      
      // Success - construct the raw GitHub URL
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      
      return {
        success: true,
        url,
        filename
      };
    } catch (error) {
      lastError = error;
      
      // Don't retry authentication errors
      if (error.message.includes('authentication')) {
        throw error;
      }
      
      // If not the last attempt, wait with exponential backoff
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await sleep(backoffMs);
      }
    }
  }
  
  // All retries exhausted
  throw new Error(`Failed to upload ${filename} after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Get list of all avatar files from GitHub repository
 * Uses mcp_github_get_file_contents to list files in avatars directory
 * 
 * @param {string} repoString - Repository in format "owner/repo"
 * @param {Function} mcpTool - MCP tool function (mcp_github_get_file_contents)
 * @param {Object} options - Options
 * @param {string} options.branch - Branch to read from (default: 'main')
 * @returns {Promise<Array<{filename: string, url: string, path: string}>>}
 * @throws {Error} If authentication fails or directory doesn't exist
 */
export async function getAvatarList(repoString, mcpTool, options = {}) {
  const { branch = 'main' } = options;
  const { owner, repo } = parseRepoString(repoString);
  const path = 'avatars';
  
  try {
    // Call MCP tool to get directory contents
    const result = await mcpTool({
      owner,
      repo,
      path,
      ref: `refs/heads/${branch}`
    });
    
    // Check for authentication errors
    if (result.error) {
      if (result.error.includes('auth') || result.error.includes('401') || result.error.includes('403')) {
        throw new Error(`GitHub authentication failed: ${result.error}`);
      }
      // Directory might not exist yet (empty repository)
      if (result.error.includes('404') || result.error.includes('Not Found')) {
        return [];
      }
      throw new Error(`GitHub API error: ${result.error}`);
    }
    
    // Result should be an array of file objects
    // Handle both array response and object with content array
    const files = Array.isArray(result) ? result : (result.content || []);
    
    // Filter for PNG files only and map to our format
    return files
      .filter(file => file.type === 'file' && file.name.endsWith('.png'))
      .map(file => ({
        filename: file.name,
        path: file.path,
        url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`
      }));
  } catch (error) {
    // Re-throw with context
    if (error.message.includes('authentication')) {
      throw error;
    }
    throw new Error(`Failed to get avatar list: ${error.message}`);
  }
}

export default {
  uploadToGitHub,
  getAvatarList,
  generateFilename
};
