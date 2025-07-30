/**
 * Google Cloud Billing resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId } from "../../utils/auth.js";
import { stateManager } from "../../utils/state-manager.js";
import { GcpMcpError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import {
  getBillingClient,
  getCatalogClient,
  formatBillingAccount,
  formatCostData,
  formatCostRecommendations,
  formatCurrency,
  BillingAccount,
  CostData,
  CostRecommendation,
} from "./types.js";

/**
 * Registers Google Cloud Billing resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerBillingResources(server: McpServer): void {
  // Resource template for billing account summary
  server.resource(
    "gcp-billing-account-summary",
    new ResourceTemplate("gcp-billing://{billingAccountName}/summary", {
      list: undefined,
    }),
    async (uri, { billingAccountName }) => {
      try {
        const actualBillingAccountName = Array.isArray(billingAccountName)
          ? billingAccountName[0]
          : billingAccountName;

        if (!actualBillingAccountName) {
          throw new GcpMcpError(
            "Billing account name is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        const billingClient = getBillingClient();

        logger.debug(
          `Getting billing account summary for: ${actualBillingAccountName}`,
        );

        // Get billing account details
        const [account] = await billingClient.getBillingAccount({
          name: actualBillingAccountName,
        });

        if (!account) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Billing Account Not Found\n\nBilling account not found: ${actualBillingAccountName}\n\nPlease check the account name and your permissions.`,
              },
            ],
          };
        }

        // Get associated projects
        const [projects] = await billingClient.listProjectBillingInfo({
          name: actualBillingAccountName,
          pageSize: 100,
        });

        const billingAccount: BillingAccount = {
          name: account.name || "",
          displayName: account.displayName || "Unknown",
          open: account.open || false,
          masterBillingAccount: account.masterBillingAccount,
          parent: account.parent,
        };

        let content = formatBillingAccount(billingAccount);

        content += `\n## Associated Projects\n\n`;

        if (projects && projects.length > 0) {
          content += `**Total Projects:** ${projects.length}\n\n`;
          content += "| Project ID | Billing Enabled | Project Name |\n";
          content += "|------------|-----------------|-------------|\n";

          for (const project of projects) {
            const projectId =
              project.name?.replace("projects/", "") || "Unknown";
            const billingEnabled = project.billingEnabled ? "✅ Yes" : "❌ No";
            const projectName = project.name || "Unknown";

            content += `| ${projectId} | ${billingEnabled} | ${projectName} |\n`;
          }
        } else {
          content += "No projects associated with this billing account.\n";
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting billing account summary: ${error.message}`);

        const errorBillingAccountName = Array.isArray(billingAccountName)
          ? billingAccountName[0]
          : billingAccountName || "unknown";

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Billing Account Summary\n\nAn error occurred while fetching billing account summary for ${errorBillingAccountName}: ${error.message}\n\nPlease check your Google Cloud credentials and billing permissions.`,
            },
          ],
        };
      }
    },
  );

  // Resource template for all billing accounts overview
  server.resource(
    "gcp-billing-all-accounts",
    new ResourceTemplate("gcp-billing://accounts/overview", {
      list: undefined,
    }),
    async (uri) => {
      try {
        const billingClient = getBillingClient();

        logger.debug("Getting overview of all billing accounts");

        // Get all billing accounts
        const [accounts] = await billingClient.listBillingAccounts({
          pageSize: 50,
        });

        let content = `# Billing Accounts Overview\n\n`;

        if (!accounts || accounts.length === 0) {
          content +=
            "No billing accounts found. You may need billing account access permissions.\n";
        } else {
          content += `**Total Accounts:** ${accounts.length}\n\n`;

          // Summary statistics
          const activeAccounts = accounts.filter((account) => account.open);
          const closedAccounts = accounts.filter((account) => !account.open);

          content += `**Active Accounts:** ${activeAccounts.length}\n`;
          content += `**Closed Accounts:** ${closedAccounts.length}\n\n`;

          // List all accounts
          content += "## Account Details\n\n";

          for (const account of accounts) {
            const billingAccount: BillingAccount = {
              name: account.name || "",
              displayName: account.displayName || "Unknown",
              open: account.open || false,
              masterBillingAccount: account.masterBillingAccount,
              parent: account.parent,
            };

            content += formatBillingAccount(billingAccount) + "\n";
          }
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error getting billing accounts overview: ${error.message}`,
        );

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Billing Accounts\n\nAn error occurred while fetching billing accounts overview: ${error.message}\n\nPlease check your Google Cloud credentials and billing permissions.`,
            },
          ],
        };
      }
    },
  );

  // Resource template for active Google Cloud services
  server.resource(
    "gcp-billing-active-services",
    new ResourceTemplate("gcp-billing://services/active", {
      list: undefined,
    }),
    async (uri) => {
      try {
        const catalogClient = getCatalogClient();

        logger.debug("Getting active Google Cloud services");

        // Get all Google Cloud services
        const [services] = await catalogClient.listServices({
          pageSize: 100,
        });

        let content = `# Active Google Cloud Services\n\n`;

        if (!services || services.length === 0) {
          content += "No Google Cloud services found.\n";
        } else {
          content += `**Total Services:** ${services.length}\n\n`;

          // Group services by business entity
          const servicesByEntity = new Map<string, typeof services>();

          for (const service of services) {
            const entity = service.businessEntityName || "Unknown";
            if (!servicesByEntity.has(entity)) {
              servicesByEntity.set(entity, []);
            }
            servicesByEntity.get(entity)!.push(service);
          }

          content += `**Business Entities:** ${servicesByEntity.size}\n\n`;

          // List services by entity
          for (const [entity, entityServices] of servicesByEntity) {
            content += `## ${entity}\n\n`;
            content += `**Services:** ${entityServices.length}\n\n`;

            content += "| Service ID | Display Name |\n";
            content += "|------------|-------------|\n";

            for (const service of entityServices) {
              const serviceId = service.serviceId || "Unknown";
              const displayName = service.displayName || "Unknown";

              content += `| ${serviceId} | ${displayName} |\n`;
            }

            content += "\n";
          }
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting active services: ${error.message}`);

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Google Cloud Services\n\nAn error occurred while fetching Google Cloud services: ${error.message}\n\nPlease check your Google Cloud credentials.`,
            },
          ],
        };
      }
    },
  );

  // Resource template for project costs summary
  server.resource(
    "gcp-billing-project-costs",
    new ResourceTemplate("gcp-billing://projects/{projectId}/costs", {
      list: undefined,
    }),
    async (uri, { projectId }) => {
      try {
        // Use project hierarchy: provided -> state manager -> auth default
        const actualProjectId =
          (Array.isArray(projectId) ? projectId[0] : projectId) ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        if (!actualProjectId) {
          throw new GcpMcpError(
            "Project ID is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        logger.debug(`Getting project costs for: ${actualProjectId}`);

        // Mock project cost data for demonstration
        const mockProjectCosts: CostData[] = [
          {
            billingAccountName: "billingAccounts/example-123",
            projectId: actualProjectId,
            serviceId: "compute.googleapis.com",
            cost: { amount: 2750.3, currency: "USD" },
            usage: { amount: 180, unit: "hours" },
            period: {
              startTime: "2024-01-01T00:00:00Z",
              endTime: "2024-01-31T23:59:59Z",
            },
            labels: { environment: "production", team: "backend" },
          },
          {
            billingAccountName: "billingAccounts/example-123",
            projectId: actualProjectId,
            serviceId: "storage.googleapis.com",
            cost: { amount: 156.75, currency: "USD" },
            usage: { amount: 850, unit: "GB" },
            period: {
              startTime: "2024-01-01T00:00:00Z",
              endTime: "2024-01-31T23:59:59Z",
            },
            labels: { environment: "production", team: "data" },
          },
        ];

        let content = `# Project Cost Summary\n\n`;
        content += `**Project ID:** ${actualProjectId}\n\n`;

        content += `⚠️ **Note:** This is demonstration data. For actual project costs, `;
        content += `you would need to query BigQuery billing export filtered by project.\n\n`;

        content += formatCostData(mockProjectCosts);

        // Calculate totals
        const totalCost = mockProjectCosts.reduce(
          (sum, cost) => sum + cost.cost.amount,
          0,
        );

        content += `\n## Project Summary\n\n`;
        content += `**Total Monthly Cost:** ${formatCurrency(totalCost)}\n`;
        content += `**Services Used:** ${new Set(mockProjectCosts.map((c) => c.serviceId)).size}\n`;

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting project costs: ${error.message}`);

        const errorProjectId = Array.isArray(projectId)
          ? projectId[0]
          : projectId || "unknown";

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Project Costs\n\nAn error occurred while fetching costs for project ${errorProjectId}: ${error.message}\n\nPlease check your Google Cloud credentials and billing permissions.`,
            },
          ],
        };
      }
    },
  );

  // Resource template for monthly cost summaries (mock data)
  server.resource(
    "gcp-billing-monthly-costs",
    new ResourceTemplate("gcp-billing://{billingAccountName}/costs/monthly", {
      list: undefined,
    }),
    async (uri, { billingAccountName }) => {
      try {
        const actualBillingAccountName = Array.isArray(billingAccountName)
          ? billingAccountName[0]
          : billingAccountName;

        if (!actualBillingAccountName) {
          throw new GcpMcpError(
            "Billing account name is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        logger.debug(
          `Getting monthly costs for billing account: ${actualBillingAccountName}`,
        );

        // Mock monthly cost data for demonstration
        const mockMonthlyCosts: CostData[] = [
          {
            billingAccountName: actualBillingAccountName,
            cost: { amount: 4520.75, currency: "USD" },
            usage: { amount: 720, unit: "hours" },
            period: {
              startTime: "2024-01-01T00:00:00Z",
              endTime: "2024-01-31T23:59:59Z",
            },
            labels: { month: "January", year: "2024" },
          },
          {
            billingAccountName: actualBillingAccountName,
            cost: { amount: 3890.25, currency: "USD" },
            usage: { amount: 672, unit: "hours" },
            period: {
              startTime: "2024-02-01T00:00:00Z",
              endTime: "2024-02-29T23:59:59Z",
            },
            labels: { month: "February", year: "2024" },
          },
          {
            billingAccountName: actualBillingAccountName,
            cost: { amount: 5125.5, currency: "USD" },
            usage: { amount: 744, unit: "hours" },
            period: {
              startTime: "2024-03-01T00:00:00Z",
              endTime: "2024-03-31T23:59:59Z",
            },
            labels: { month: "March", year: "2024" },
          },
        ];

        let content = `# Monthly Cost Summary\n\n`;
        content += `**Billing Account:** ${actualBillingAccountName}\n\n`;

        content += `⚠️ **Note:** This is demonstration data. For actual monthly costs, `;
        content += `you would need to query BigQuery billing export or use Cloud Billing Report API.\n\n`;

        content += formatCostData(mockMonthlyCosts);

        // Calculate trends
        const totalCost = mockMonthlyCosts.reduce(
          (sum, cost) => sum + cost.cost.amount,
          0,
        );
        const avgMonthlyCost = totalCost / mockMonthlyCosts.length;

        content += `\n## Summary Statistics\n\n`;
        content += `**Total Cost (3 months):** ${formatCurrency(totalCost)}\n`;
        content += `**Average Monthly Cost:** ${formatCurrency(avgMonthlyCost)}\n`;

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting monthly costs: ${error.message}`);

        const errorBillingAccountName = Array.isArray(billingAccountName)
          ? billingAccountName[0]
          : billingAccountName || "unknown";

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Monthly Costs\n\nAn error occurred while fetching monthly costs for ${errorBillingAccountName}: ${error.message}\n\nPlease check your Google Cloud credentials and billing permissions.`,
            },
          ],
        };
      }
    },
  );

  // Resource template for cost optimisation recommendations (mock data)
  server.resource(
    "gcp-billing-cost-recommendations",
    new ResourceTemplate("gcp-billing://{billingAccountName}/recommendations", {
      list: undefined,
    }),
    async (uri, { billingAccountName }) => {
      try {
        const actualBillingAccountName = Array.isArray(billingAccountName)
          ? billingAccountName[0]
          : billingAccountName;

        if (!actualBillingAccountName) {
          throw new GcpMcpError(
            "Billing account name is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        logger.debug(
          `Getting cost recommendations for billing account: ${actualBillingAccountName}`,
        );

        // Mock recommendations for demonstration
        const mockRecommendations: CostRecommendation[] = [
          {
            type: "rightsizing",
            projectId: "production-project",
            serviceId: "compute.googleapis.com",
            resourceName: "web-server-pool",
            description:
              "Web server instances show consistent low CPU utilisation patterns",
            potentialSavings: { amount: 1250, currency: "USD", percentage: 35 },
            effort: "medium",
            priority: "high",
            actionRequired:
              "Right-size instances from n1-standard-4 to n1-standard-2",
            implementationSteps: [
              "Analyse traffic patterns during peak and off-peak hours",
              "Test performance with smaller instance types in staging",
              "Schedule maintenance window for production changes",
              "Monitor performance after implementation",
            ],
          },
          {
            type: "committed_use",
            projectId: "data-processing-project",
            serviceId: "compute.googleapis.com",
            resourceName: "batch-processing-cluster",
            description:
              "Sustained compute workloads eligible for committed use discounts",
            potentialSavings: { amount: 890, currency: "USD", percentage: 25 },
            effort: "low",
            priority: "high",
            actionRequired:
              "Purchase 1-year committed use discount for compute resources",
            implementationSteps: [
              "Review historical usage patterns for last 12 months",
              "Calculate optimal committed use quantity",
              "Purchase committed use discount through console",
              "Monitor usage against commitment",
            ],
          },
          {
            type: "idle_resources",
            projectId: "development-project",
            serviceId: "storage.googleapis.com",
            resourceName: "orphaned-storage-buckets",
            description:
              "Several storage buckets have not been accessed in over 6 months",
            potentialSavings: { amount: 245, currency: "USD", percentage: 100 },
            effort: "low",
            priority: "medium",
            actionRequired:
              "Clean up unused storage buckets and implement lifecycle policies",
            implementationSteps: [
              "Audit bucket contents and access patterns",
              "Coordinate with development teams on data retention",
              "Create snapshots for critical data if needed",
              "Delete unused buckets and set up lifecycle management",
            ],
          },
        ];

        let content = `# Cost Optimisation Recommendations\n\n`;
        content += `**Billing Account:** ${actualBillingAccountName}\n\n`;

        content += `⚠️ **Note:** This is demonstration data. For actual recommendations, `;
        content += `integrate with Google Cloud Recommender API and analyse billing export data.\n\n`;

        content += formatCostRecommendations(mockRecommendations);

        // Summary
        const totalPotentialSavings = mockRecommendations.reduce(
          (sum, rec) => sum + rec.potentialSavings.amount,
          0,
        );

        content += `\n## Recommendation Summary\n\n`;
        content += `**Total Recommendations:** ${mockRecommendations.length}\n`;
        content += `**Total Potential Savings:** ${formatCurrency(totalPotentialSavings)}\n`;

        const highPriorityRecs = mockRecommendations.filter(
          (rec) => rec.priority === "high",
        );
        const highPrioritySavings = highPriorityRecs.reduce(
          (sum, rec) => sum + rec.potentialSavings.amount,
          0,
        );

        content += `**High Priority Savings:** ${formatCurrency(highPrioritySavings)} (${highPriorityRecs.length} recommendations)\n`;

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting cost recommendations: ${error.message}`);

        const errorBillingAccountName = Array.isArray(billingAccountName)
          ? billingAccountName[0]
          : billingAccountName || "unknown";

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Cost Recommendations\n\nAn error occurred while fetching cost recommendations for ${errorBillingAccountName}: ${error.message}\n\nPlease check your Google Cloud credentials and billing permissions.`,
            },
          ],
        };
      }
    },
  );
}
