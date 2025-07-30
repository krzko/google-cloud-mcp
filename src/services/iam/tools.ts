/**
 * Google Cloud IAM tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId } from "../../utils/auth.js";
import {
  getResourceManagerClient,
  formatIamPolicy,
  IamPolicy,
  getDeploymentPermissionSet,
  getAllDeploymentPermissionSets,
  DEPLOYMENT_PERMISSION_SETS,
} from "./types.js";
import { logger } from "../../utils/logger.js";

/**
 * Registers Google Cloud IAM tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerIamTools(server: McpServer): void {
  // Tool to get project-level IAM policy
  server.registerTool(
    "gcp-iam-get-project-policy",
    {
      title: "Get Project IAM Policy",
      description: "Retrieve the IAM policy for a Google Cloud project",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project ID (defaults to current project)"),
        requestedPolicyVersion: z
          .number()
          .min(1)
          .max(3)
          .default(3)
          .describe("The policy format version (1, 2, or 3)"),
      },
    },
    async ({ project, requestedPolicyVersion }) => {
      try {
        const projectId = project || (await getProjectId());
        const resourceManager = getResourceManagerClient();

        const [policy] = await resourceManager.getIamPolicy({
          resource: `projects/${projectId}`,
          options: {
            requestedPolicyVersion,
          },
        });

        if (!policy) {
          return {
            content: [
              {
                type: "text",
                text: `# Project IAM Policy Not Found\n\nNo IAM policy found for project: ${projectId}`,
              },
            ],
          };
        }

        const formattedPolicy = formatIamPolicy(policy as IamPolicy);

        return {
          content: [
            {
              type: "text",
              text: `# Project IAM Policy\n\nProject: ${projectId}\nPolicy Version: ${requestedPolicyVersion}\n\n${formattedPolicy}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error getting project IAM policy: ${errorMessage}`);

        return {
          content: [
            {
              type: "text",
              text: `# Error Getting Project IAM Policy\n\nFailed to retrieve IAM policy for project "${project || "current"}": ${errorMessage}\n\nPlease ensure:\n- The project ID is correct\n- You have the required permissions (resourcemanager.projects.getIamPolicy)\n- The project exists and is accessible`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool to test IAM permissions on a project
  server.registerTool(
    "gcp-iam-test-project-permissions",
    {
      title: "Test Project IAM Permissions",
      description:
        "Test which permissions the current caller has on a Google Cloud project",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project ID (defaults to current project)"),
        permissions: z
          .array(z.string())
          .describe(
            'List of permissions to test (e.g., ["resourcemanager.projects.get", "compute.instances.list"])',
          ),
      },
    },
    async ({ project, permissions }) => {
      try {
        const projectId = project || (await getProjectId());
        const resourceManager = getResourceManagerClient();

        const [response] = await resourceManager.testIamPermissions({
          resource: `projects/${projectId}`,
          permissions,
        });

        const grantedPermissions = response.permissions || [];
        const deniedPermissions = permissions.filter(
          (p) => !grantedPermissions.includes(p),
        );

        let result = `# Project IAM Permissions Test\n\nProject: ${projectId}\n\n`;

        result += `## ✅ Granted Permissions (${grantedPermissions.length})\n\n`;
        if (grantedPermissions.length > 0) {
          grantedPermissions.forEach((permission) => {
            result += `- ${permission}\n`;
          });
        } else {
          result += `*No permissions granted*\n`;
        }

        result += `\n## ❌ Denied Permissions (${deniedPermissions.length})\n\n`;
        if (deniedPermissions.length > 0) {
          deniedPermissions.forEach((permission) => {
            result += `- ${permission}\n`;
          });
        } else {
          result += `*All permissions granted*\n`;
        }

        result += `\n**Summary:** ${grantedPermissions.length}/${permissions.length} permissions granted on project ${projectId}\n`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error testing project IAM permissions: ${errorMessage}`);

        return {
          content: [
            {
              type: "text",
              text: `# Error Testing Project IAM Permissions\n\nFailed to test IAM permissions on project "${project || "current"}": ${errorMessage}\n\nPlease ensure the project ID is correct and accessible.`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool to test permissions on specific resources
  server.registerTool(
    "gcp-iam-test-resource-permissions",
    {
      title: "Test Resource-Specific IAM Permissions",
      description:
        "Test which permissions the current caller has on specific Google Cloud resources",
      inputSchema: {
        resource: z
          .string()
          .describe(
            'The full resource name (e.g., "projects/my-project/buckets/my-bucket", "projects/my-project/zones/us-central1-a/instances/my-instance")',
          ),
        permissions: z
          .array(z.string())
          .describe("List of permissions to test on the resource"),
      },
    },
    async ({ resource, permissions }) => {
      try {
        const resourceManager = getResourceManagerClient();

        const [response] = await resourceManager.testIamPermissions({
          resource,
          permissions,
        });

        const grantedPermissions = response.permissions || [];
        const deniedPermissions = permissions.filter(
          (p) => !grantedPermissions.includes(p),
        );

        let result = `# Resource IAM Permissions Test\n\nResource: ${resource}\n\n`;

        result += `## ✅ Granted Permissions (${grantedPermissions.length})\n\n`;
        if (grantedPermissions.length > 0) {
          grantedPermissions.forEach((permission) => {
            result += `- ${permission}\n`;
          });
        } else {
          result += `*No permissions granted*\n`;
        }

        result += `\n## ❌ Denied Permissions (${deniedPermissions.length})\n\n`;
        if (deniedPermissions.length > 0) {
          deniedPermissions.forEach((permission) => {
            result += `- ${permission}\n`;
          });
        } else {
          result += `*All permissions granted*\n`;
        }

        result += `\n**Summary:** ${grantedPermissions.length}/${permissions.length} permissions granted on resource ${resource}\n`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error testing resource IAM permissions: ${errorMessage}`);

        return {
          content: [
            {
              type: "text",
              text: `# Error Testing Resource IAM Permissions\n\nFailed to test IAM permissions on resource "${resource}": ${errorMessage}\n\nPlease ensure:\n- The resource name is correct and properly formatted\n- The resource exists and is accessible\n- You have the required permissions to test IAM permissions on this resource`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool to validate deployment permissions for common GCP services
  server.registerTool(
    "gcp-iam-validate-deployment-permissions",
    {
      title: "Validate Deployment Permissions",
      description:
        "Check if current caller has required permissions for deploying to common GCP services",
      inputSchema: {
        service: z
          .string()
          .describe(
            "GCP service to validate (cloud-run, gke, compute-engine, cloud-functions, app-engine, cloud-storage, cloud-sql)",
          ),
        project: z
          .string()
          .optional()
          .describe("Project ID (defaults to current project)"),
        includeOptional: z
          .boolean()
          .default(false)
          .describe("Include optional permissions in the validation"),
      },
    },
    async ({ service, project, includeOptional }) => {
      try {
        const projectId = project || (await getProjectId());
        const resourceManager = getResourceManagerClient();

        const permissionSet = getDeploymentPermissionSet(service);
        if (!permissionSet) {
          const availableServices = getAllDeploymentPermissionSets()
            .map((s) => s.service.toLowerCase())
            .join(", ");
          return {
            content: [
              {
                type: "text",
                text: `# Invalid Service\n\nService "${service}" not found.\n\n**Available services:** ${availableServices}`,
              },
            ],
            isError: true,
          };
        }

        const allPermissions = [...permissionSet.requiredPermissions];
        if (includeOptional && permissionSet.optionalPermissions) {
          allPermissions.push(...permissionSet.optionalPermissions);
        }

        const [response] = await resourceManager.testIamPermissions({
          resource: `projects/${projectId}`,
          permissions: allPermissions,
        });

        const grantedPermissions = response.permissions || [];
        const missingRequired = permissionSet.requiredPermissions.filter(
          (p) => !grantedPermissions.includes(p),
        );
        const missingOptional =
          includeOptional && permissionSet.optionalPermissions
            ? permissionSet.optionalPermissions.filter(
                (p) => !grantedPermissions.includes(p),
              )
            : [];

        let result = `# ${permissionSet.service} Deployment Validation\n\n`;
        result += `**Project:** ${projectId}\n`;
        result += `**Service:** ${permissionSet.service}\n`;
        result += `**Description:** ${permissionSet.description}\n\n`;

        // Overall status
        const canDeploy = missingRequired.length === 0;
        result += `## 🎯 Deployment Status: ${canDeploy ? "✅ READY" : "❌ BLOCKED"}\n\n`;

        if (canDeploy) {
          result += `✅ You have all required permissions to deploy ${permissionSet.service}\n\n`;
        } else {
          result += `❌ Missing ${missingRequired.length} required permission(s) for ${permissionSet.service} deployment\n\n`;
        }

        // Required permissions analysis
        result += `## Required Permissions (${permissionSet.requiredPermissions.length})\n\n`;
        permissionSet.requiredPermissions.forEach((permission) => {
          const status = grantedPermissions.includes(permission) ? "✅" : "❌";
          result += `${status} ${permission}\n`;
        });

        // Optional permissions analysis (if requested)
        if (
          includeOptional &&
          permissionSet.optionalPermissions &&
          permissionSet.optionalPermissions.length > 0
        ) {
          result += `\n## Optional Permissions (${permissionSet.optionalPermissions.length})\n\n`;
          permissionSet.optionalPermissions.forEach((permission) => {
            const status = grantedPermissions.includes(permission)
              ? "✅"
              : "❌";
            result += `${status} ${permission}\n`;
          });
        }

        // Common resources
        if (permissionSet.commonResources.length > 0) {
          result += `\n## Common Resource Patterns\n\n`;
          permissionSet.commonResources.forEach((resource) => {
            result += `- ${resource}\n`;
          });
        }

        // Summary and next steps
        result += `\n## Summary\n\n`;
        result += `- **Required:** ${permissionSet.requiredPermissions.length - missingRequired.length}/${permissionSet.requiredPermissions.length} granted\n`;
        if (includeOptional && permissionSet.optionalPermissions) {
          result += `- **Optional:** ${permissionSet.optionalPermissions.length - missingOptional.length}/${permissionSet.optionalPermissions.length} granted\n`;
        }

        if (!canDeploy) {
          result += `\n### ⚠️ Missing Required Permissions\n\n`;
          missingRequired.forEach((permission) => {
            result += `- ${permission}\n`;
          });
          result += `\n**Next Steps:** Contact your GCP administrator to grant the missing required permissions.\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          `Error validating deployment permissions: ${errorMessage}`,
        );

        return {
          content: [
            {
              type: "text",
              text: `# Error Validating Deployment Permissions\n\nFailed to validate permissions for ${service}: ${errorMessage}\n\nPlease ensure the project ID is correct and accessible.`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool to list all available deployment permission sets
  server.registerTool(
    "gcp-iam-list-deployment-services",
    {
      title: "List Available Deployment Services",
      description:
        "List all GCP services with pre-defined deployment permission sets",
      inputSchema: {},
    },
    async () => {
      try {
        const permissionSets = getAllDeploymentPermissionSets();

        let result = `# Available Deployment Services\n\n`;
        result += `The following GCP services have pre-defined permission sets for deployment validation:\n\n`;

        permissionSets.forEach((set) => {
          // Get the service key from the original keys
          const serviceKey =
            Object.keys(DEPLOYMENT_PERMISSION_SETS).find(
              (key) => DEPLOYMENT_PERMISSION_SETS[key] === set,
            ) || set.service.toLowerCase().replace(/\s+/g, "-");

          result += `## ${set.service}\n\n`;
          result += `**Service Key:** \`${serviceKey}\`\n`;
          result += `**Description:** ${set.description}\n`;
          result += `**Required Permissions:** ${set.requiredPermissions.length}\n`;
          result += `**Optional Permissions:** ${set.optionalPermissions?.length || 0}\n\n`;
        });

        result += `## Usage\n\n`;
        result += `Use the \`validate-deployment-permissions\` tool with the service key to check your permissions for deploying to any of these services.\n\n`;
        result += `**Example:** \`validate-deployment-permissions\` with service="cloud-run"\n`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error listing deployment services: ${errorMessage}`);

        return {
          content: [
            {
              type: "text",
              text: `# Error Listing Deployment Services\n\nFailed to list deployment services: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool to analyse permission gaps for a specific resource and operation
  server.registerTool(
    "gcp-iam-analyse-permission-gaps",
    {
      title: "Analyse Permission Gaps",
      description:
        "Compare current permissions against required permissions for specific operations and identify gaps",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project ID (defaults to current project)"),
        requiredPermissions: z
          .array(z.string())
          .describe("List of permissions required for the intended operation"),
        operationDescription: z
          .string()
          .optional()
          .describe(
            "Description of the operation being attempted (for context)",
          ),
      },
    },
    async ({ project, requiredPermissions, operationDescription }) => {
      try {
        const projectId = project || (await getProjectId());
        const resourceManager = getResourceManagerClient();

        const [response] = await resourceManager.testIamPermissions({
          resource: `projects/${projectId}`,
          permissions: requiredPermissions,
        });

        const grantedPermissions = response.permissions || [];
        const missingPermissions = requiredPermissions.filter(
          (p) => !grantedPermissions.includes(p),
        );

        let result = `# Permission Gap Analysis\n\n`;
        result += `**Project:** ${projectId}\n`;
        if (operationDescription) {
          result += `**Operation:** ${operationDescription}\n`;
        }
        result += `**Total Required Permissions:** ${requiredPermissions.length}\n\n`;

        // Overall status
        const hasAllPermissions = missingPermissions.length === 0;
        result += `## 🎯 Status: ${hasAllPermissions ? "✅ AUTHORISED" : "❌ INSUFFICIENT PERMISSIONS"}\n\n`;

        if (hasAllPermissions) {
          result += `✅ You have all required permissions for this operation.\n\n`;
        } else {
          result += `❌ Missing ${missingPermissions.length} permission(s). Operation will likely fail.\n\n`;
        }

        // Detailed breakdown
        result += `## Permission Analysis\n\n`;

        result += `### ✅ Granted Permissions (${grantedPermissions.length})\n\n`;
        if (grantedPermissions.length > 0) {
          grantedPermissions.forEach((permission) => {
            result += `- ${permission}\n`;
          });
        } else {
          result += `*No permissions granted*\n`;
        }

        result += `\n### ❌ Missing Permissions (${missingPermissions.length})\n\n`;
        if (missingPermissions.length > 0) {
          missingPermissions.forEach((permission) => {
            result += `- ${permission}\n`;
          });
        } else {
          result += `*No missing permissions*\n`;
        }

        // Recommendations
        if (missingPermissions.length > 0) {
          result += `\n## 📋 Recommendations\n\n`;
          result += `1. **Contact your GCP administrator** to request the missing permissions\n`;
          result += `2. **Use predefined roles** that include these permissions:\n`;

          // Suggest some common roles that might contain these permissions
          const suggestedRoles = [];
          if (missingPermissions.some((p) => p.startsWith("compute."))) {
            suggestedRoles.push(
              "roles/compute.admin",
              "roles/compute.instanceAdmin",
            );
          }
          if (missingPermissions.some((p) => p.startsWith("storage."))) {
            suggestedRoles.push(
              "roles/storage.admin",
              "roles/storage.objectAdmin",
            );
          }
          if (missingPermissions.some((p) => p.startsWith("run."))) {
            suggestedRoles.push("roles/run.admin", "roles/run.developer");
          }
          if (missingPermissions.some((p) => p.startsWith("container."))) {
            suggestedRoles.push(
              "roles/container.admin",
              "roles/container.developer",
            );
          }
          if (missingPermissions.some((p) => p.startsWith("iam."))) {
            suggestedRoles.push(
              "roles/iam.serviceAccountUser",
              "roles/iam.serviceAccountAdmin",
            );
          }

          if (suggestedRoles.length > 0) {
            suggestedRoles.forEach((role) => {
              result += `   - ${role}\n`;
            });
          } else {
            result += `   - Contact administrator for custom role assignment\n`;
          }

          result += `3. **Create a custom role** with exactly these permissions if predefined roles are too broad\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error analysing permission gaps: ${errorMessage}`);

        return {
          content: [
            {
              type: "text",
              text: `# Error Analysing Permission Gaps\n\nFailed to analyse permissions: ${errorMessage}\n\nPlease ensure the project ID is correct and accessible.`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
