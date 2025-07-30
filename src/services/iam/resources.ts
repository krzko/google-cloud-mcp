/**
 * Google Cloud IAM resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import {
  getResourceManagerClient,
  formatIamPolicy,
  IamPolicy,
} from "./types.js";
import { logger } from "../../utils/logger.js";

/**
 * Registers Google Cloud IAM resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerIamResources(server: McpServer): void {
  // Register a resource for project IAM policy
  server.resource(
    "gcp-iam-project-policy",
    new ResourceTemplate("gcp-iam://{projectId}/policy", { list: undefined }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = Array.isArray(projectId)
          ? projectId[0]
          : projectId || (await getProjectId());
        const resourceManager = getResourceManagerClient();

        logger.debug(`Fetching IAM policy for project: ${actualProjectId}`);

        const [policy] = await resourceManager.getIamPolicy({
          resource: `projects/${actualProjectId}`,
          options: {
            requestedPolicyVersion: 3,
          },
        });

        if (!policy) {
          throw new GcpMcpError(
            `No IAM policy found for project: ${actualProjectId}`,
            "NOT_FOUND",
            404,
          );
        }

        const formattedPolicy = formatIamPolicy(policy as IamPolicy);

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: `# Project IAM Policy\n\nProject: ${actualProjectId}\n\n${formattedPolicy}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching project IAM policy: ${errorMessage}`);

        throw new GcpMcpError(
          `Failed to fetch IAM policy for project: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Register a resource for IAM policy analysis summary
  server.resource(
    "gcp-iam-policy-summary",
    new ResourceTemplate("gcp-iam://{projectId}/summary", { list: undefined }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = Array.isArray(projectId)
          ? projectId[0]
          : projectId || (await getProjectId());
        const resourceManager = getResourceManagerClient();

        logger.debug(
          `Generating IAM policy summary for project: ${actualProjectId}`,
        );

        const [policy] = await resourceManager.getIamPolicy({
          resource: `projects/${actualProjectId}`,
          options: {
            requestedPolicyVersion: 3,
          },
        });

        if (!policy || !policy.bindings) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/markdown",
                text: `# IAM Policy Summary\n\nProject: ${actualProjectId}\n\n**No IAM policy found or no bindings configured.**`,
              },
            ],
          };
        }

        let summary = `# IAM Policy Summary\n\nProject: ${actualProjectId}\n\n`;

        // Count different types of members
        const memberTypes = {
          users: 0,
          serviceAccounts: 0,
          groups: 0,
          domains: 0,
          allUsers: 0,
          allAuthenticatedUsers: 0,
          other: 0,
        };

        const roleCount = policy.bindings.length;
        let totalMembers = 0;
        const uniqueRoles = new Set<string>();

        policy.bindings.forEach((binding) => {
          if (binding.role) uniqueRoles.add(binding.role);
          if (binding.members) {
            totalMembers += binding.members.length;
            binding.members.forEach((member) => {
              if (member.startsWith("user:")) memberTypes.users++;
              else if (member.startsWith("serviceAccount:"))
                memberTypes.serviceAccounts++;
              else if (member.startsWith("group:")) memberTypes.groups++;
              else if (member.startsWith("domain:")) memberTypes.domains++;
              else if (member === "allUsers") memberTypes.allUsers++;
              else if (member === "allAuthenticatedUsers")
                memberTypes.allAuthenticatedUsers++;
              else memberTypes.other++;
            });
          }
        });

        summary += `## Overview\n\n`;
        summary += `- **Total Role Bindings:** ${roleCount}\n`;
        summary += `- **Unique Roles:** ${uniqueRoles.size}\n`;
        summary += `- **Total Member Assignments:** ${totalMembers}\n`;
        summary += `- **Policy Version:** ${policy.version || 1}\n\n`;

        summary += `## Member Types\n\n`;
        if (memberTypes.users > 0)
          summary += `- **Users:** ${memberTypes.users}\n`;
        if (memberTypes.serviceAccounts > 0)
          summary += `- **Service Accounts:** ${memberTypes.serviceAccounts}\n`;
        if (memberTypes.groups > 0)
          summary += `- **Groups:** ${memberTypes.groups}\n`;
        if (memberTypes.domains > 0)
          summary += `- **Domains:** ${memberTypes.domains}\n`;
        if (memberTypes.allUsers > 0)
          summary += `- **All Users (Public):** ${memberTypes.allUsers} ⚠️\n`;
        if (memberTypes.allAuthenticatedUsers > 0)
          summary += `- **All Authenticated Users:** ${memberTypes.allAuthenticatedUsers} ⚠️\n`;
        if (memberTypes.other > 0)
          summary += `- **Other:** ${memberTypes.other}\n`;

        if (memberTypes.allUsers > 0 || memberTypes.allAuthenticatedUsers > 0) {
          summary += `\n⚠️ **Security Notice:** This project has public access configured. Review these bindings carefully.\n`;
        }

        // List the most common roles
        const roleCounts = new Map<string, number>();
        policy.bindings.forEach((binding) => {
          if (binding.role && binding.members) {
            roleCounts.set(
              binding.role,
              (roleCounts.get(binding.role) || 0) + binding.members.length,
            );
          }
        });

        const topRoles = Array.from(roleCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        if (topRoles.length > 0) {
          summary += `\n## Most Assigned Roles\n\n`;
          topRoles.forEach(([role, count]) => {
            summary += `- **${role}:** ${count} assignments\n`;
          });
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: summary,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error generating IAM policy summary: ${errorMessage}`);

        throw new GcpMcpError(
          `Failed to generate IAM policy summary: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );
}
