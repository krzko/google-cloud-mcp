/**
 * Google Cloud Billing service for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBillingTools } from "./tools.js";
import { registerBillingResources } from "./resources.js";

/**
 * Registers Google Cloud Billing service with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerBillingService(server: McpServer): void {
  registerBillingTools(server);
  registerBillingResources(server);
}

// Export types for external use
export * from "./types.js";
