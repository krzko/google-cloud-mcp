/**
 * Google Cloud Billing tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import { logger } from "../../utils/logger.js";
import { stateManager } from "../../utils/state-manager.js";
import {
  getBillingClient,
  getCatalogClient,
  formatBillingAccount,
  formatCostData,
  formatCostAnomalies,
  formatCostRecommendations,
  formatCurrency,
  detectCostAnomalies,
  calculatePercentageChange,
  BillingAccount,
  ProjectBillingInfo,
  CloudService,
  SKU,
  CostData,
  CostAnomaly,
  CostRecommendation,
  BILLING_IAM_PERMISSIONS,
} from "./types.js";

/**
 * Registers Google Cloud Billing tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerBillingTools(server: McpServer): void {
  // Tool to list billing accounts
  server.registerTool(
    "gcp-billing-list-accounts",
    {
      title: "List Billing Accounts",
      description:
        "List all Google Cloud billing accounts accessible to the user",
      inputSchema: {
        pageSize: z
          .number()
          .min(1)
          .max(50)
          .default(20)
          .describe("Maximum number of billing accounts to return (1-50)"),
        pageToken: z
          .string()
          .optional()
          .describe("Token for pagination to get next page of results"),
        filter: z
          .string()
          .optional()
          .describe("Optional filter for billing accounts (e.g., 'open=true')"),
      },
    },
    async ({ pageSize, pageToken, filter }) => {
      try {
        const billingClient = getBillingClient();

        logger.debug(`Listing billing accounts with pageSize: ${pageSize}`);

        const request: any = {
          pageSize,
        };

        if (pageToken) {
          request.pageToken = pageToken;
        }

        if (filter) {
          request.filter = filter;
        }

        const [accounts, nextPageToken] =
          await billingClient.listBillingAccounts(request);

        if (!accounts || accounts.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No billing accounts found. You may need billing account access permissions.",
              },
            ],
          };
        }

        let response = `# Billing Accounts\n\n`;
        response += `Found ${accounts.length} billing account(s):\n\n`;

        for (const account of accounts) {
          const billingAccount: BillingAccount = {
            name: account.name || "",
            displayName: account.displayName || "Unknown",
            open: account.open || false,
            masterBillingAccount: account.masterBillingAccount,
            parent: account.parent,
          };

          response += formatBillingAccount(billingAccount) + "\n";
        }

        if (nextPageToken) {
          response += `\n**Next Page Token:** ${nextPageToken}\n`;
          response += `Use this token with the same tool to get the next page of results.\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error listing billing accounts: ${error.message}`);
        throw new GcpMcpError(
          `Failed to list billing accounts: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to get billing account details
  server.registerTool(
    "gcp-billing-get-account-details",
    {
      title: "Get Billing Account Details",
      description:
        "Retrieve detailed information about a specific Google Cloud billing account",
      inputSchema: {
        billingAccountName: z
          .string()
          .describe(
            "Billing account name (e.g., 'billingAccounts/123456-789ABC-DEF012')",
          ),
      },
    },
    async ({ billingAccountName }) => {
      try {
        const billingClient = getBillingClient();

        logger.debug(
          `Getting billing account details for: ${billingAccountName}`,
        );

        const [account] = await billingClient.getBillingAccount({
          name: billingAccountName,
        });

        if (!account) {
          return {
            content: [
              {
                type: "text",
                text: `Billing account not found: ${billingAccountName}`,
              },
            ],
          };
        }

        const billingAccount: BillingAccount = {
          name: account.name || "",
          displayName: account.displayName || "Unknown",
          open: account.open || false,
          masterBillingAccount: account.masterBillingAccount,
          parent: account.parent,
        };

        const response = formatBillingAccount(billingAccount);

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting billing account details: ${error.message}`);
        throw new GcpMcpError(
          `Failed to get billing account details: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to list projects associated with billing account
  server.registerTool(
    "gcp-billing-list-projects",
    {
      title: "List Billing Account Projects",
      description:
        "List all projects associated with a specific Google Cloud billing account",
      inputSchema: {
        billingAccountName: z
          .string()
          .describe(
            "Billing account name (e.g., 'billingAccounts/123456-789ABC-DEF012')",
          ),
        pageSize: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum number of projects to return (1-200)"),
        pageToken: z
          .string()
          .optional()
          .describe("Token for pagination to get next page of results"),
      },
    },
    async ({ billingAccountName, pageSize, pageToken }) => {
      try {
        const billingClient = getBillingClient();

        logger.debug(
          `Listing projects for billing account: ${billingAccountName}`,
        );

        const request: any = {
          name: billingAccountName,
          pageSize,
        };

        if (pageToken) {
          request.pageToken = pageToken;
        }

        const [projects, nextPageToken] =
          await billingClient.listProjectBillingInfo(request);

        if (!projects || projects.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No projects found for billing account: ${billingAccountName}`,
              },
            ],
          };
        }

        let response = `# Projects for Billing Account\n\n`;
        response += `**Billing Account:** ${billingAccountName}\n`;
        response += `**Projects Found:** ${projects.length}\n\n`;

        response += "| Project ID | Billing Enabled | Project Name |\n";
        response += "|------------|-----------------|-------------|\n";

        for (const project of projects) {
          const projectId = project.name?.replace("projects/", "") || "Unknown";
          const billingEnabled = project.billingEnabled ? "✅ Yes" : "❌ No";
          const projectName = project.name || "Unknown";

          response += `| ${projectId} | ${billingEnabled} | ${projectName} |\n`;
        }

        if (nextPageToken) {
          response += `\n**Next Page Token:** ${nextPageToken}\n`;
          response += `Use this token with the same tool to get the next page of results.\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(
          `Error listing projects for billing account: ${error.message}`,
        );
        throw new GcpMcpError(
          `Failed to list projects for billing account: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to get project billing information
  server.registerTool(
    "gcp-billing-get-project-info",
    {
      title: "Get Project Billing Information",
      description:
        "Retrieve billing configuration and status for a Google Cloud project",
      inputSchema: {
        projectId: z
          .string()
          .optional()
          .describe(
            "Project ID (defaults to current project from state manager)",
          ),
      },
    },
    async ({ projectId }) => {
      try {
        // Use project hierarchy: provided -> state manager -> auth default
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        if (!actualProjectId) {
          throw new GcpMcpError(
            "No project ID available. Please provide a project ID or configure a default project.",
            "INVALID_ARGUMENT",
            400,
          );
        }

        const billingClient = getBillingClient();

        logger.debug(`Getting billing info for project: ${actualProjectId}`);

        const [billingInfo] = await billingClient.getProjectBillingInfo({
          name: `projects/${actualProjectId}`,
        });

        if (!billingInfo) {
          return {
            content: [
              {
                type: "text",
                text: `# Project Billing Information\n\nNo billing information found for project: ${actualProjectId}\n\nThis could mean:\n- The project doesn't exist\n- You don't have billing permissions\n- The project is not associated with a billing account`,
              },
            ],
          };
        }

        const projectBillingInfo: ProjectBillingInfo = {
          name: billingInfo.name || "",
          projectId: actualProjectId,
          billingAccountName: billingInfo.billingAccountName || undefined,
          billingEnabled: billingInfo.billingEnabled || false,
        };

        let response = `# Project Billing Information\n\n`;
        response += `**Project ID:** ${projectBillingInfo.projectId}\n`;
        response += `**Project Name:** ${projectBillingInfo.name}\n`;
        response += `**Billing Enabled:** ${projectBillingInfo.billingEnabled ? "✅ Yes" : "❌ No"}\n`;

        if (projectBillingInfo.billingAccountName) {
          response += `**Billing Account:** ${projectBillingInfo.billingAccountName}\n`;
        } else {
          response += `**Billing Account:** Not associated\n`;
        }

        if (!projectBillingInfo.billingEnabled) {
          response += `\n## Required Permissions\n\n`;
          response += `To manage billing for this project, you need:\n`;
          response += `- \`${BILLING_IAM_PERMISSIONS.BILLING_RESOURCE_ASSOCIATIONS_CREATE}\` - To associate with billing account\n`;
          response += `- \`${BILLING_IAM_PERMISSIONS.BILLING_ACCOUNTS_LIST}\` - To list available billing accounts\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting project billing info: ${error.message}`);
        throw new GcpMcpError(
          `Failed to get project billing info: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to list Google Cloud services
  server.registerTool(
    "gcp-billing-list-services",
    {
      title: "List Google Cloud Services",
      description:
        "List all available Google Cloud services for billing and cost analysis",
      inputSchema: {
        pageSize: z
          .number()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum number of services to return (1-200)"),
        pageToken: z
          .string()
          .optional()
          .describe("Token for pagination to get next page of results"),
      },
    },
    async ({ pageSize, pageToken }) => {
      try {
        const catalogClient = getCatalogClient();

        logger.debug(
          `Listing Google Cloud services with pageSize: ${pageSize}`,
        );

        const request: any = {
          pageSize,
        };

        if (pageToken) {
          request.pageToken = pageToken;
        }

        const [services, nextPageToken] =
          await catalogClient.listServices(request);

        if (!services || services.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No Google Cloud services found.",
              },
            ],
          };
        }

        let response = `# Google Cloud Services\n\n`;
        response += `Found ${services.length} service(s):\n\n`;

        response += "| Service ID | Display Name | Business Entity |\n";
        response += "|------------|--------------|----------------|\n";

        for (const service of services) {
          const cloudService: CloudService = {
            name: service.name || "",
            serviceId: service.serviceId || "Unknown",
            displayName: service.displayName || "Unknown",
            businessEntityName: service.businessEntityName || "Unknown",
          };

          response += `| ${cloudService.serviceId} | ${cloudService.displayName} | ${cloudService.businessEntityName} |\n`;
        }

        if (nextPageToken) {
          response += `\n**Next Page Token:** ${nextPageToken}\n`;
          response += `Use this token with the same tool to get the next page of results.\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error listing services: ${error.message}`);
        throw new GcpMcpError(
          `Failed to list services: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to list SKUs for a service
  server.registerTool(
    "gcp-billing-list-skus",
    {
      title: "List Service SKUs",
      description:
        "List all SKUs (Stock Keeping Units) and pricing information for a Google Cloud service",
      inputSchema: {
        serviceId: z
          .string()
          .describe(
            "Google Cloud service ID (e.g., 'services/6F81-5844-456A')",
          ),
        pageSize: z
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of SKUs to return (1-100)"),
        pageToken: z
          .string()
          .optional()
          .describe("Token for pagination to get next page of results"),
        currencyCode: z
          .string()
          .default("USD")
          .describe("Currency code for pricing information (default: USD)"),
      },
    },
    async ({ serviceId, pageSize, pageToken, currencyCode }) => {
      try {
        const catalogClient = getCatalogClient();

        logger.debug(`Listing SKUs for service: ${serviceId}`);

        const request: any = {
          parent: serviceId,
          pageSize,
          currencyCode,
        };

        if (pageToken) {
          request.pageToken = pageToken;
        }

        const [skus, nextPageToken] = await catalogClient.listSkus(request);

        if (!skus || skus.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No SKUs found for service: ${serviceId}`,
              },
            ],
          };
        }

        let response = `# SKUs for Service\n\n`;
        response += `**Service:** ${serviceId}\n`;
        response += `**Currency:** ${currencyCode}\n`;
        response += `**SKUs Found:** ${skus.length}\n\n`;

        for (const skuData of skus) {
          const sku: SKU = {
            name: skuData.name || "",
            skuId: skuData.skuId || "Unknown",
            description: skuData.description || "Unknown SKU",
            category: {
              serviceDisplayName:
                skuData.category?.serviceDisplayName || "Unknown",
              resourceFamily: skuData.category?.resourceFamily || "Unknown",
              resourceGroup: skuData.category?.resourceGroup || "Unknown",
              usageType: skuData.category?.usageType || "Unknown",
            },
            serviceRegions: skuData.serviceRegions || [],
            pricingInfo: (skuData.pricingInfo || []).map((pi) => ({
              summary: pi.summary || "",
              pricingExpression: {
                usageUnit: pi.pricingExpression?.usageUnit || "",
                usageUnitDescription:
                  pi.pricingExpression?.usageUnitDescription || "",
                baseUnit: pi.pricingExpression?.baseUnit || "",
                baseUnitDescription:
                  pi.pricingExpression?.baseUnitDescription || "",
                baseUnitConversionFactor:
                  pi.pricingExpression?.baseUnitConversionFactor || 0,
                displayQuantity: pi.pricingExpression?.displayQuantity || 0,
                tieredRates: (pi.pricingExpression?.tieredRates || []).map(
                  (tr) => ({
                    startUsageAmount: tr.startUsageAmount || 0,
                    unitPrice: {
                      currencyCode: tr.unitPrice?.currencyCode || "USD",
                      units: String(tr.unitPrice?.units || "0"),
                      nanos: tr.unitPrice?.nanos || 0,
                    },
                  }),
                ),
              },
              currencyConversionRate: pi.currencyConversionRate || 1,
              effectiveTime:
                typeof pi.effectiveTime === "string"
                  ? pi.effectiveTime
                  : pi.effectiveTime
                    ? new Date().toISOString()
                    : "",
            })),
            serviceProviderName: skuData.serviceProviderName || "Unknown",
            geoTaxonomy: skuData.geoTaxonomy
              ? {
                  type: String(skuData.geoTaxonomy.type || "Unknown"),
                  regions: skuData.geoTaxonomy.regions || [],
                }
              : undefined,
          };

          response += `## ${sku.description}\n\n`;
          response += `**SKU ID:** ${sku.skuId}\n`;
          response += `**Service Provider:** ${sku.serviceProviderName}\n`;
          response += `**Category:**\n`;
          response += `- Service: ${sku.category.serviceDisplayName}\n`;
          response += `- Resource Family: ${sku.category.resourceFamily}\n`;
          response += `- Resource Group: ${sku.category.resourceGroup}\n`;
          response += `- Usage Type: ${sku.category.usageType}\n`;

          if (sku.serviceRegions.length > 0) {
            response += `**Regions:** ${sku.serviceRegions.join(", ")}\n`;
          }

          if (sku.geoTaxonomy) {
            response += `**Geographic Taxonomy:** ${sku.geoTaxonomy.type}\n`;
            if (sku.geoTaxonomy.regions.length > 0) {
              response += `**Geo Regions:** ${sku.geoTaxonomy.regions.join(", ")}\n`;
            }
          }

          if (sku.pricingInfo.length > 0) {
            response += `**Pricing Information:** ${sku.pricingInfo.length} pricing tier(s) available\n`;
          }

          response += "\n---\n\n";
        }

        if (nextPageToken) {
          response += `**Next Page Token:** ${nextPageToken}\n`;
          response += `Use this token with the same tool to get the next page of results.\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error listing SKUs: ${error.message}`);
        throw new GcpMcpError(
          `Failed to list SKUs: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to analyse costs (mock implementation for demonstration)
  server.registerTool(
    "gcp-billing-analyse-costs",
    {
      title: "Analyse Billing Costs",
      description:
        "Perform detailed cost analysis with trends and insights for Google Cloud billing data",
      inputSchema: {
        billingAccountName: z
          .string()
          .describe(
            "Billing account name (e.g., 'billingAccounts/123456-789ABC-DEF012')",
          ),
        startDate: z
          .string()
          .describe("Start date for cost analysis (ISO format: YYYY-MM-DD)"),
        endDate: z
          .string()
          .describe("End date for cost analysis (ISO format: YYYY-MM-DD)"),
        projectId: z
          .string()
          .optional()
          .describe("Optional project ID to filter costs"),
        serviceId: z
          .string()
          .optional()
          .describe("Optional service ID to filter costs"),
        groupBy: z
          .enum(["project", "service", "sku", "time"])
          .default("service")
          .describe("Group costs by project, service, SKU, or time"),
      },
    },
    async ({
      billingAccountName,
      startDate,
      endDate,
      projectId,
      serviceId,
      groupBy,
    }) => {
      try {
        logger.debug(
          `Analysing costs for billing account: ${billingAccountName}`,
        );

        // Use project hierarchy: provided -> state manager -> auth default
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        // Note: This is a mock implementation since BigQuery billing export or
        // Cloud Billing Report API would be needed for actual cost data
        const mockCostData: CostData[] = [
          {
            billingAccountName,
            projectId: actualProjectId || "example-project-1",
            serviceId: serviceId || "compute.googleapis.com",
            cost: { amount: 1250.5, currency: "USD" },
            usage: { amount: 100, unit: "hours" },
            period: { startTime: startDate, endTime: endDate },
            labels: { environment: "production" },
          },
          {
            billingAccountName,
            projectId: actualProjectId || "example-project-2",
            serviceId: serviceId || "storage.googleapis.com",
            cost: { amount: 89.25, currency: "USD" },
            usage: { amount: 500, unit: "GB" },
            period: { startTime: startDate, endTime: endDate },
            labels: { environment: "development" },
          },
        ];

        // Calculate trends using our percentage change function
        const previousMonthCosts = [
          { amount: 1150.25, currency: "USD" },
          { amount: 95.75, currency: "USD" },
        ];

        let trendsAnalysis = `\n## Cost Trends Analysis\n\n`;
        mockCostData.forEach((cost, index) => {
          const previousCost = previousMonthCosts[index]?.amount || 0;
          const percentageChange = calculatePercentageChange(
            cost.cost.amount,
            previousCost,
          );
          const changeDirection = percentageChange > 0 ? "📈" : "📉";
          const changeIcon = Math.abs(percentageChange) > 20 ? "⚠️" : "✅";

          trendsAnalysis += `**${cost.projectId} (${cost.serviceId}):** `;
          trendsAnalysis += `${changeIcon} ${changeDirection} ${percentageChange.toFixed(1)}% `;
          trendsAnalysis += `(${formatCurrency(previousCost)} → ${formatCurrency(cost.cost.amount)})\n`;
        });

        let response = `# Cost Analysis\n\n`;
        response += `**Billing Account:** ${billingAccountName}\n`;
        response += `**Period:** ${startDate} to ${endDate}\n`;
        response += `**Grouped By:** ${groupBy}\n\n`;

        response += `⚠️ **Note:** This is a demonstration with mock data. `;
        response += `For actual cost analysis, you would need to:\n`;
        response += `1. Enable BigQuery billing export\n`;
        response += `2. Use Cloud Billing Report API\n`;
        response += `3. Query the billing export dataset\n\n`;

        response += formatCostData(mockCostData);
        response += trendsAnalysis;

        const totalCost = mockCostData.reduce(
          (sum, cost) => sum + cost.cost.amount,
          0,
        );
        response += `\n**Total Cost:** ${formatCurrency(totalCost)}\n`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error analysing costs: ${error.message}`);
        throw new GcpMcpError(
          `Failed to analyse costs: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to detect cost anomalies (mock implementation)
  server.registerTool(
    "gcp-billing-detect-anomalies",
    {
      title: "Detect Cost Anomalies",
      description:
        "Detect unusual cost patterns and spending anomalies in Google Cloud billing data",
      inputSchema: {
        billingAccountName: z
          .string()
          .describe(
            "Billing account name (e.g., 'billingAccounts/123456-789ABC-DEF012')",
          ),
        lookbackDays: z
          .number()
          .min(7)
          .max(90)
          .default(30)
          .describe("Number of days to look back for comparison (7-90)"),
        thresholdPercentage: z
          .number()
          .min(10)
          .max(500)
          .default(50)
          .describe("Percentage threshold for anomaly detection (10-500%)"),
        projectId: z
          .string()
          .optional()
          .describe("Optional project ID to filter anomalies"),
      },
    },
    async ({
      billingAccountName,
      lookbackDays,
      thresholdPercentage,
      projectId,
    }) => {
      try {
        // Use project hierarchy: provided -> state manager -> auth default
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        logger.debug(
          `Detecting cost anomalies for billing account: ${billingAccountName}, project: ${actualProjectId || "all"}`,
        );

        // Mock current and historical cost data for demonstration
        const currentCosts: CostData[] = [
          {
            billingAccountName,
            projectId: actualProjectId || "example-project-1",
            serviceId: "compute.googleapis.com",
            cost: { amount: 2500, currency: "USD" },
            usage: { amount: 200, unit: "hours" },
            period: {
              startTime: new Date(
                Date.now() - 24 * 60 * 60 * 1000,
              ).toISOString(),
              endTime: new Date().toISOString(),
            },
          },
        ];

        const historicalCosts: CostData[] = [
          {
            billingAccountName,
            projectId: actualProjectId || "example-project-1",
            serviceId: "compute.googleapis.com",
            cost: { amount: 1250, currency: "USD" },
            usage: { amount: 100, unit: "hours" },
            period: {
              startTime: new Date(
                Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
              ).toISOString(),
              endTime: new Date(
                Date.now() - (lookbackDays - 1) * 24 * 60 * 60 * 1000,
              ).toISOString(),
            },
          },
        ];

        const anomalies: CostAnomaly[] = detectCostAnomalies(
          currentCosts,
          historicalCosts,
          thresholdPercentage,
        );

        let response = `# Cost Anomaly Detection\n\n`;
        response += `**Billing Account:** ${billingAccountName}\n`;
        response += `**Project:** ${actualProjectId || "All projects"}\n`;
        response += `**Lookback Period:** ${lookbackDays} days\n`;
        response += `**Threshold:** ${thresholdPercentage}%\n`;
        response += `**Anomalies Found:** ${anomalies.length}\n\n`;

        response += `⚠️ **Note:** This is a demonstration with mock data. `;
        response += `For actual anomaly detection, you would need access to historical billing data.\n\n`;

        if (anomalies.length > 0) {
          response += `## Detected Anomalies\n\n`;
          anomalies.forEach((anomaly: CostAnomaly, index: number) => {
            response += `### ${index + 1}. ${anomaly.anomalyType.toUpperCase()} - ${anomaly.severity.toUpperCase()}\n\n`;
            response += `**Project:** ${anomaly.projectId}\n`;
            response += `**Service:** ${anomaly.serviceId}\n`;
            response += `**Description:** ${anomaly.description}\n`;
            response += `**Current Cost:** ${formatCurrency(anomaly.currentCost)}\n`;
            response += `**Expected Cost:** ${formatCurrency(anomaly.expectedCost)}\n`;
            response += `**Change:** ${anomaly.percentageChange > 0 ? "+" : ""}${anomaly.percentageChange.toFixed(1)}%\n`;
            response += `**Detected:** ${new Date(anomaly.detectedAt).toLocaleString("en-AU")}\n`;

            if (anomaly.recommendations && anomaly.recommendations.length > 0) {
              response += `**Recommendations:**\n`;
              anomaly.recommendations.forEach((rec) => {
                response += `- ${rec}\n`;
              });
            }

            response += "\n";
          });
        } else {
          response += formatCostAnomalies(anomalies);
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error detecting cost anomalies: ${error.message}`);
        throw new GcpMcpError(
          `Failed to detect cost anomalies: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to generate cost recommendations (mock implementation)
  server.registerTool(
    "gcp-billing-cost-recommendations",
    {
      title: "Generate Cost Recommendations",
      description:
        "Generate cost optimisation recommendations with potential savings for Google Cloud billing",
      inputSchema: {
        billingAccountName: z
          .string()
          .describe(
            "Billing account name (e.g., 'billingAccounts/123456-789ABC-DEF012')",
          ),
        projectId: z
          .string()
          .optional()
          .describe("Optional project ID to filter recommendations"),
        minSavingsAmount: z
          .number()
          .min(0)
          .default(10)
          .describe("Minimum savings amount to include in recommendations"),
        priority: z
          .enum(["low", "medium", "high", "all"])
          .default("all")
          .describe("Filter recommendations by priority level"),
      },
    },
    async ({ billingAccountName, projectId, minSavingsAmount, priority }) => {
      try {
        // Use project hierarchy: provided -> state manager -> auth default
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        logger.debug(
          `Generating cost recommendations for billing account: ${billingAccountName}, project: ${actualProjectId || "all"}`,
        );

        // Mock recommendations for demonstration
        const mockRecommendations: CostRecommendation[] = [
          {
            type: "rightsizing",
            projectId: actualProjectId || "example-project-1",
            serviceId: "compute.googleapis.com",
            resourceName: "instance-group-1",
            description:
              "Compute Engine instances are underutilised and can be right-sized",
            potentialSavings: { amount: 450, currency: "USD", percentage: 30 },
            effort: "medium",
            priority: "high",
            actionRequired:
              "Resize instances from n1-standard-4 to n1-standard-2",
            implementationSteps: [
              "Stop the affected instances during maintenance window",
              "Change machine type from n1-standard-4 to n1-standard-2",
              "Restart instances and monitor performance",
              "Validate application performance meets requirements",
            ],
          },
          {
            type: "idle_resources",
            projectId: actualProjectId || "example-project-2",
            serviceId: "storage.googleapis.com",
            resourceName: "unused-disk-volumes",
            description:
              "Several persistent disks are not attached to any instances",
            potentialSavings: { amount: 125, currency: "USD", percentage: 100 },
            effort: "low",
            priority: "medium",
            actionRequired: "Delete unattached persistent disks",
            implementationSteps: [
              "Verify disks are not needed for backups or future use",
              "Create snapshots if data retention is required",
              "Delete unattached persistent disks",
              "Set up alerts to monitor for future unattached disks",
            ],
          },
        ];

        // Filter by minimum savings amount
        const filteredRecommendations = mockRecommendations.filter(
          (rec) => rec.potentialSavings.amount >= minSavingsAmount,
        );

        // Filter by priority if specified
        const finalRecommendations =
          priority === "all"
            ? filteredRecommendations
            : filteredRecommendations.filter(
                (rec) => rec.priority === priority,
              );

        let response = `# Cost Optimisation Recommendations\n\n`;
        response += `**Billing Account:** ${billingAccountName}\n`;
        response += `**Minimum Savings:** ${formatCurrency(minSavingsAmount)}\n`;
        response += `**Priority Filter:** ${priority}\n\n`;

        response += `⚠️ **Note:** This is a demonstration with mock recommendations. `;
        response += `For actual recommendations, integrate with Google Cloud Recommender API.\n\n`;

        response += formatCostRecommendations(finalRecommendations);

        if (finalRecommendations.length > 0) {
          const totalSavings = finalRecommendations.reduce(
            (sum, rec) => sum + rec.potentialSavings.amount,
            0,
          );
          response += `\n**Total Potential Savings:** ${formatCurrency(totalSavings)}\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error generating cost recommendations: ${error.message}`);
        throw new GcpMcpError(
          `Failed to generate cost recommendations: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );

  // Tool to get detailed cost breakdown by service
  server.registerTool(
    "gcp-billing-service-breakdown",
    {
      title: "Get Service Cost Breakdown",
      description:
        "Get detailed cost breakdown by Google Cloud service with usage and SKU information",
      inputSchema: {
        billingAccountName: z
          .string()
          .describe(
            "Billing account name (e.g., 'billingAccounts/123456-789ABC-DEF012')",
          ),
        projectId: z
          .string()
          .optional()
          .describe("Optional project ID to filter costs"),
        timeRange: z
          .enum(["7d", "30d", "90d", "1y"])
          .default("30d")
          .describe("Time range for analysis (7d, 30d, 90d, 1y)"),
      },
    },
    async ({ billingAccountName, projectId, timeRange }) => {
      try {
        // Use project hierarchy: provided -> state manager -> auth default
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        logger.debug(
          `Getting service breakdown for billing account: ${billingAccountName}, project: ${actualProjectId || "all"}, range: ${timeRange}`,
        );

        // Mock detailed service cost data
        const serviceBreakdown: CostData[] = [
          {
            billingAccountName,
            projectId: actualProjectId || "production-project",
            serviceId: "compute.googleapis.com",
            skuId:
              "services/6F81-5844-456A/skus/CP-COMPUTEENGINE-VMIMAGE-N1-STANDARD-1",
            cost: { amount: 1847.25, currency: "USD" },
            usage: { amount: 744, unit: "hours" },
            period: {
              startTime: new Date(
                Date.now() -
                  parseInt(timeRange.slice(0, -1)) * 24 * 60 * 60 * 1000,
              ).toISOString(),
              endTime: new Date().toISOString(),
            },
            labels: {
              environment: "production",
              team: "backend",
              instance_type: "n1-standard-1",
              zone: "us-central1-a",
            },
          },
          {
            billingAccountName,
            projectId: actualProjectId || "production-project",
            serviceId: "storage.googleapis.com",
            skuId: "services/95FF-2EF5-5EA1/skus/9E26-D0CA-7C08",
            cost: { amount: 426.8, currency: "USD" },
            usage: { amount: 2500, unit: "GB" },
            period: {
              startTime: new Date(
                Date.now() -
                  parseInt(timeRange.slice(0, -1)) * 24 * 60 * 60 * 1000,
              ).toISOString(),
              endTime: new Date().toISOString(),
            },
            labels: {
              environment: "production",
              team: "data",
              storage_class: "standard",
              location: "us-central1",
            },
          },
          {
            billingAccountName,
            projectId: actualProjectId || "development-project",
            serviceId: "bigquery.googleapis.com",
            skuId: "services/24E6-581D-38E5/skus/1145-49C5-8000",
            cost: { amount: 189.45, currency: "USD" },
            usage: { amount: 1250, unit: "TB" },
            period: {
              startTime: new Date(
                Date.now() -
                  parseInt(timeRange.slice(0, -1)) * 24 * 60 * 60 * 1000,
              ).toISOString(),
              endTime: new Date().toISOString(),
            },
            labels: {
              environment: "development",
              team: "analytics",
              query_type: "on_demand",
            },
          },
        ];

        let response = `# Service Cost Breakdown\n\n`;
        response += `**Billing Account:** ${billingAccountName}\n`;
        response += `**Project:** ${actualProjectId || "All projects"}\n`;
        response += `**Time Range:** ${timeRange}\n`;
        response += `**Services Analysed:** ${new Set(serviceBreakdown.map((c) => c.serviceId)).size}\n\n`;

        response += `⚠️ **Note:** This is demonstration data with detailed service and SKU breakdown.\n\n`;

        // Group by service for detailed analysis
        const serviceMap = new Map<string, CostData[]>();
        serviceBreakdown.forEach((costData: CostData) => {
          if (!serviceMap.has(costData.serviceId!)) {
            serviceMap.set(costData.serviceId!, []);
          }
          serviceMap.get(costData.serviceId!)!.push(costData);
        });

        // Detailed breakdown by service
        for (const [serviceId, costs] of serviceMap) {
          const serviceName = serviceId
            .replace(".googleapis.com", "")
            .toUpperCase();
          const serviceTotal = costs.reduce(
            (sum, cost) => sum + cost.cost.amount,
            0,
          );

          response += `## ${serviceName}\n\n`;
          response += `**Service ID:** ${serviceId}\n`;
          response += `**Total Cost:** ${formatCurrency(serviceTotal)}\n`;
          response += `**SKUs:** ${costs.length}\n\n`;

          response += "| Project | SKU ID | Cost | Usage | Labels |\n";
          response += "|---------|--------|------|-------|--------|\n";

          costs.forEach((costData: CostData) => {
            const project = costData.projectId || "Unknown";
            const skuId = costData.skuId
              ? costData.skuId.split("/").pop()
              : "Unknown";
            const cost = formatCurrency(costData.cost.amount);
            const usage = `${costData.usage.amount} ${costData.usage.unit}`;
            const labels = costData.labels
              ? Object.entries(costData.labels)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(", ")
              : "None";

            response += `| ${project} | ${skuId} | ${cost} | ${usage} | ${labels} |\n`;
          });

          response += "\n";
        }

        // Summary
        const totalCost = serviceBreakdown.reduce(
          (sum, cost) => sum + cost.cost.amount,
          0,
        );
        response += `## Summary\n\n`;
        response += `**Total Cost:** ${formatCurrency(totalCost)}\n`;
        response += `**Average Cost per Service:** ${formatCurrency(totalCost / serviceMap.size)}\n`;

        // Top cost drivers
        const sortedServices = Array.from(serviceMap.entries())
          .map(([serviceId, costs]) => ({
            serviceId,
            total: costs.reduce((sum, cost) => sum + cost.cost.amount, 0),
          }))
          .sort((a, b) => b.total - a.total);

        response += `**Top Cost Driver:** ${sortedServices[0].serviceId} (${formatCurrency(sortedServices[0].total)})\n`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Error getting service breakdown: ${error.message}`);
        throw new GcpMcpError(
          `Failed to get service breakdown: ${error.message}`,
          error.code || "UNKNOWN",
          error.status || 500,
        );
      }
    },
  );
}
