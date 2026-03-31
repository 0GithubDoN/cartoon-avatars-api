/**
 * Figma Client Wrapper
 * 
 * Provides methods to interact with Figma API via MCP tools:
 * - getFigmaNodes: Discover avatar nodes in a Figma file
 * - exportNodeAsPNG: Export a specific node as PNG
 * 
 * Requirements: 1.1, 1.2, 1.3
 */

/**
 * Extract file key from Figma URL
 * @param {string} figmaUrl - Full Figma file URL
 * @returns {string} File key
 */
function extractFileKey(figmaUrl) {
  // URL format: https://www.figma.com/design/{fileKey}/{fileName}?node-id=...
  const match = figmaUrl.match(/\/design\/([^\/]+)/);
  if (!match) {
    throw new Error('Invalid Figma URL format. Expected: https://www.figma.com/design/{fileKey}/...');
  }
  return match[1];
}

/**
 * Extract node ID from Figma URL
 * @param {string} figmaUrl - Full Figma file URL
 * @returns {string|null} Node ID or null if not present
 */
function extractNodeId(figmaUrl) {
  // URL format: ...?node-id=0-1
  const match = figmaUrl.match(/node-id=([^&]+)/);
  return match ? match[1].replace('-', ':') : null;
}

/**
 * Parse XML metadata to extract rounded-rectangle nodes
 * @param {string} xmlContent - XML content from mcp_figma_get_metadata
 * @returns {Array<{id: string, name: string, type: string}>} Array of node objects
 */
function parseMetadataXML(xmlContent) {
  const nodes = [];
  
  // Simple regex-based XML parsing for rounded-rectangle elements
  // Format: <ROUNDED_RECTANGLE id="..." name="..." ...>
  const roundedRectRegex = /<ROUNDED_RECTANGLE[^>]*id="([^"]+)"[^>]*name="([^"]+)"[^>]*>/g;
  
  let match;
  while ((match = roundedRectRegex.exec(xmlContent)) !== null) {
    nodes.push({
      id: match[1],
      name: match[2],
      type: 'ROUNDED_RECTANGLE'
    });
  }
  
  return nodes;
}

/**
 * Get all avatar nodes from a Figma file
 * Uses mcp_figma_get_metadata to discover rounded-rectangle nodes
 * 
 * @param {string} figmaUrl - Full Figma file URL
 * @param {Function} mcpTool - MCP tool function (mcp_figma_get_metadata)
 * @returns {Promise<Array<{id: string, name: string, type: string}>>} Array of avatar nodes
 * @throws {Error} If authentication fails or file is not accessible
 */
export async function getFigmaNodes(figmaUrl, mcpTool) {
  try {
    const fileKey = extractFileKey(figmaUrl);
    const nodeId = extractNodeId(figmaUrl) || '0:1'; // Default to root node
    
    // Call MCP tool to get metadata
    const result = await mcpTool({
      fileKey,
      nodeId,
      clientLanguages: 'javascript',
      clientFrameworks: 'node'
    });
    
    // Check for authentication errors
    if (result.error) {
      if (result.error.includes('auth') || result.error.includes('401') || result.error.includes('403')) {
        throw new Error(`Figma authentication failed: ${result.error}`);
      }
      throw new Error(`Figma API error: ${result.error}`);
    }
    
    // Parse the XML content to extract rounded-rectangle nodes
    const nodes = parseMetadataXML(result.content || result);
    
    return nodes;
  } catch (error) {
    // Re-throw with context
    if (error.message.includes('authentication')) {
      throw error;
    }
    throw new Error(`Failed to get Figma nodes: ${error.message}`);
  }
}

/**
 * Export a Figma node as PNG
 * Uses mcp_figma_get_screenshot to export the node
 * 
 * @param {string} figmaUrl - Full Figma file URL
 * @param {string} nodeId - Node ID to export
 * @param {Function} mcpTool - MCP tool function (mcp_figma_get_screenshot)
 * @returns {Promise<Buffer>} PNG image data as Buffer
 * @throws {Error} If authentication fails or export fails
 */
export async function exportNodeAsPNG(figmaUrl, nodeId, mcpTool) {
  try {
    const fileKey = extractFileKey(figmaUrl);
    
    // Call MCP tool to get screenshot
    const result = await mcpTool({
      fileKey,
      nodeId,
      clientLanguages: 'javascript',
      clientFrameworks: 'node'
    });
    
    // Check for authentication errors
    if (result.error) {
      if (result.error.includes('auth') || result.error.includes('401') || result.error.includes('403')) {
        throw new Error(`Figma authentication failed: ${result.error}`);
      }
      throw new Error(`Figma API error: ${result.error}`);
    }
    
    // The result should contain image data
    // MCP tools typically return base64 or binary data
    if (result.image) {
      // If base64, convert to Buffer
      if (typeof result.image === 'string') {
        return Buffer.from(result.image, 'base64');
      }
      // If already Buffer
      return result.image;
    }
    
    // If result is directly the image data
    if (Buffer.isBuffer(result)) {
      return result;
    }
    
    throw new Error('No image data returned from Figma API');
  } catch (error) {
    // Re-throw with context
    if (error.message.includes('authentication')) {
      throw error;
    }
    throw new Error(`Failed to export node ${nodeId} as PNG: ${error.message}`);
  }
}

export default {
  getFigmaNodes,
  exportNodeAsPNG,
  extractFileKey,
  extractNodeId
};
