/**
 * Project management tools for Google Cloud MCP
 *
 * This module provides tools for managing Google Cloud project settings
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId, setProjectId, getRecentProjectIds } from "./auth.js";
import { stateManager } from "./state-manager.js";
import { logger } from "./logger.js";

/**
 * Registers project management tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerProjectTools(server: McpServer): void {
  // Tool to set the default project ID
  server.registerTool(
    "gcp-utils-set-project-id",
    {
      title: "Set Project ID",
      description:
        "Set the default Google Cloud project ID to use for all operations",
      inputSchema: {
        project_id: z
          .string()
          .describe("The Google Cloud project ID to set as default"),
      },
    },
    async ({ project_id }) => {
      try {
        await setProjectId(project_id);

        return {
          content: [
            {
              type: "text",
              text: `# Project ID Updated\n\nDefault Google Cloud project ID has been set to: \`${project_id}\`\n\nThis project ID will be used for all Google Cloud operations until changed.`,
            },
          ],
        };
      } catch (error: any) {
        // Error handling for set-project-id tool
        return {
          content: [
            {
              type: "text",
              text: `# Error Setting Project ID\n\nFailed to set project ID: ${error.message}`,
            },
          ],
        };
      }
    },
  );

  // Tool to get the current project ID
  server.registerTool(
    "gcp-utils-get-project-id",
    {
      title: "Get Project ID",
      description:
        "Get the current Google Cloud project ID and recent project history",
      inputSchema: {},
    },
    async () => {
      try {
        // Get the current project ID from the state manager first
        let projectId = stateManager.getCurrentProjectId();

        // If not available in state manager, try to get it from auth
        if (!projectId) {
          projectId = await getProjectId();
        }

        const recentProjectIds = await getRecentProjectIds();

        let markdown = `# Current Google Cloud Project\n\nCurrent project ID: \`${projectId}\`\n\n`;

        if (recentProjectIds.length > 0) {
          markdown += "## Recently Used Projects\n\n";
          for (const id of recentProjectIds) {
            markdown += `- \`${id}\`${id === projectId ? " (current)" : ""}\n`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error in get-project-id tool: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `# Error Getting Project ID\n\nFailed to get project ID: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}
