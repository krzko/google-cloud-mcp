/**
 * Google Cloud Error Reporting tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId, initGoogleAuth } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import {
  formatErrorGroupSummary,
  analyseErrorPatternsAndSuggestRemediation,
  ErrorGroupStats,
} from "./types.js";

/**
 * Registers Google Cloud Error Reporting tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerErrorReportingTools(server: McpServer): void {
  // Tool to list error groups with filtering and time range support
  server.tool(
    "gcp-error-reporting-list-groups",
    {
      title: "List Error Groups",
      description:
        "List error groups from Google Cloud Error Reporting with optional filtering and time range",
      inputSchema: {
        timeRange: z
          .string()
          .optional()
          .default("1h")
          .describe('Time range to query: "1h", "6h", "24h"/"1d", "7d", "30d"'),
        serviceFilter: z.string().optional().describe("Filter by service name"),
        order: z
          .enum([
            "COUNT_DESC",
            "LAST_SEEN_DESC",
            "CREATED_DESC",
            "AFFECTED_USERS_DESC",
          ])
          .optional()
          .default("COUNT_DESC")
          .describe("Sort order for error groups"),
        pageSize: z
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of error groups to return"),
      },
    },
    async ({ timeRange, serviceFilter, order, pageSize }) => {
      try {
        const projectId = await getProjectId();

        // Initialize Google Auth client (same pattern as trace service)
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access error reporting data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Parse time range - ensure we have a valid timeRange value
        const actualTimeRange = timeRange || "1h";
        const actualOrder = order || "COUNT_DESC";
        const actualPageSize = pageSize || 20;

        // Map time range to Google Cloud Error Reporting periods
        let period: string;
        switch (actualTimeRange) {
          case "1h":
            period = "PERIOD_1_HOUR";
            break;
          case "6h":
            period = "PERIOD_6_HOURS";
            break;
          case "24h":
          case "1d":
            period = "PERIOD_1_DAY";
            break;
          case "7d":
            period = "PERIOD_1_WEEK";
            break;
          case "30d":
            period = "PERIOD_30_DAYS";
            break;
          default:
            // Default to 1 hour for any other time range
            period = "PERIOD_1_HOUR";
            break;
        }

        // Build query parameters
        const params = new URLSearchParams({
          "timeRange.period": period,
          order: actualOrder,
          pageSize: actualPageSize.toString(),
        });

        // Add service filter if provided
        if (serviceFilter) {
          params.set("serviceFilter.service", serviceFilter);
        }

        // Make REST API call using same fetch approach as trace service
        const apiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${projectId}/groupStats?${params}`;

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new GcpMcpError(
            `Failed to fetch error group stats: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data = await response.json();
        const errorGroupStats = data.errorGroupStats || [];

        if (!errorGroupStats || errorGroupStats.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Error Groups\n\nProject: ${projectId}\nTime Range: ${actualTimeRange}\n${serviceFilter ? `Service Filter: ${serviceFilter}\n` : ""}\nNo error groups found.`,
              },
            ],
          };
        }

        // errorGroupStats should already match our ErrorGroupStats interface
        const errorSummaries: ErrorGroupStats[] = errorGroupStats;

        // Generate analysis and recommendations
        const analysis =
          analyseErrorPatternsAndSuggestRemediation(errorSummaries);

        let content = `# Error Groups Analysis\n\nProject: ${projectId}\nTime Range: ${actualTimeRange}\n${serviceFilter ? `Service Filter: ${serviceFilter}\n` : ""}\n\n${analysis}\n\n`;

        content += `## Detailed Error Groups\n\n`;

        errorSummaries.forEach((errorSummary, index) => {
          content += `### ${index + 1}. ${formatErrorGroupSummary(errorSummary)}\n`;
        });

        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to list error groups: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Tool to get detailed information about a specific error group
  server.tool(
    "gcp-error-reporting-get-group-details",
    {
      title: "Get Error Group Details",
      description:
        "Get detailed information about a specific error group including recent events",
      inputSchema: {
        groupId: z.string().describe("Error group ID to get details for"),
        timeRange: z
          .string()
          .optional()
          .default("24h")
          .describe('Time range to query events (e.g., "1h", "24h", "7d")'),
        pageSize: z
          .number()
          .min(1)
          .max(100)
          .default(10)
          .describe("Maximum number of error events to return"),
      },
    },
    async ({ groupId, timeRange, pageSize }) => {
      try {
        const projectId = await getProjectId();
        // Initialize Google Auth client (same pattern as trace service)
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access error reporting data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Parse time range - ensure we have a valid timeRange value
        const actualTimeRange = timeRange || "24h";
        const actualPageSize = pageSize || 10;

        // Map time range to Google Cloud Error Reporting periods
        let period: string;
        switch (actualTimeRange) {
          case "1h":
            period = "PERIOD_1_HOUR";
            break;
          case "6h":
            period = "PERIOD_6_HOURS";
            break;
          case "24h":
          case "1d":
            period = "PERIOD_1_DAY";
            break;
          case "7d":
            period = "PERIOD_1_WEEK";
            break;
          case "30d":
            period = "PERIOD_30_DAYS";
            break;
          default:
            // Default to 1 day for event details
            period = "PERIOD_1_DAY";
            break;
        }

        // First, get the error group details using projects.groups/get
        // The group name format should be: projects/{projectId}/groups/{groupId}
        const groupName = `projects/${projectId}/groups/${groupId}`;
        const groupApiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/${groupName}`;

        // Get group details
        const groupResponse = await fetch(groupApiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/json",
          },
        });

        if (!groupResponse.ok) {
          const errorText = await groupResponse.text();
          throw new GcpMcpError(
            `Failed to fetch error group details: ${errorText}`,
            "FAILED_PRECONDITION",
            groupResponse.status,
          );
        }

        const groupData = await groupResponse.json();

        // Build query parameters for events API
        // groupId should be the raw group identifier for the events API
        const params = new URLSearchParams({
          groupId: groupId,
          "timeRange.period": period,
          pageSize: actualPageSize.toString(),
        });

        // Make REST API call to list events
        const apiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${projectId}/events?${params}`;
        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new GcpMcpError(
            `Failed to fetch error events: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data = await response.json();
        const errorEvents = data.errorEvents || [];

        // Start building content with group details
        let content = `# Error Group Details\n\n`;

        // Add group information
        content += `**Group ID:** ${groupId}\n`;
        content += `**Project:** ${projectId}\n`;
        content += `**Group Name:** ${groupData.name || "Unknown"}\n`;
        if (groupData.resolutionStatus) {
          content += `**Resolution Status:** ${groupData.resolutionStatus}\n`;
        }
        if (groupData.trackingIssues && groupData.trackingIssues.length > 0) {
          content += `**Tracking Issues:** ${groupData.trackingIssues.length} linked\n`;
        }
        content += `**Time Range:** ${actualTimeRange}\n\n`;

        if (!errorEvents || errorEvents.length === 0) {
          content += `## Recent Error Events\n\nNo error events found for this group in the specified time range.`;
          return {
            content: [
              {
                type: "text",
                text: content,
              },
            ],
          };
        }

        content += `## Recent Error Events (${errorEvents.length})\n\n`;

        errorEvents.forEach((event: any, index: number) => {
          content += `### Event ${index + 1}\n\n`;
          content += `**Time:** ${new Date(event.eventTime).toLocaleString()}\n`;
          content += `**Service:** ${event.serviceContext?.service || "Unknown"}`;
          if (event.serviceContext?.version) {
            content += ` (v${event.serviceContext.version})`;
          }
          content += `\n\n`;
          content += `**Message:** ${event.message}\n\n`;

          if (event.context?.httpRequest) {
            const req = event.context.httpRequest;
            content += `**HTTP Request:**\n`;
            if (req.method && req.url) {
              content += `- ${req.method} ${req.url}\n`;
            }
            if (req.responseStatusCode) {
              content += `- Status: ${req.responseStatusCode}\n`;
            }
            if (req.userAgent) {
              content += `- User Agent: ${req.userAgent}\n`;
            }
            if (req.remoteIp) {
              content += `- Remote IP: ${req.remoteIp}\n`;
            }
            content += `\n`;
          }

          if (event.context?.reportLocation) {
            const loc = event.context.reportLocation;
            content += `**Source Location:**\n`;
            if (loc.filePath) {
              content += `- File: ${loc.filePath}`;
              if (loc.lineNumber) {
                content += `:${loc.lineNumber}`;
              }
              content += `\n`;
            }
            if (loc.functionName) {
              content += `- Function: ${loc.functionName}\n`;
            }
            content += `\n`;
          }

          if (event.context?.user) {
            content += `**User:** ${event.context.user}\n\n`;
          }

          content += `---\n\n`;
        });

        // Add investigation suggestions
        content += `## Investigation Steps\n\n`;
        content += `1. **Check Logs:** Use Cloud Logging to find related log entries around the error times\n`;
        content += `2. **Monitor Metrics:** Review monitoring dashboards for correlated performance metrics\n`;
        content += `3. **Recent Changes:** Check recent deployments and configuration changes\n`;
        content += `4. **Pattern Analysis:** Look for patterns in user agents, IP addresses, or request parameters\n`;
        content += `5. **Trace Analysis:** If available, examine distributed traces for request flow\n\n`;

        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to get error group details: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Tool to analyse error trends over time
  server.tool(
    "gcp-error-reporting-analyse-trends",
    {
      title: "Analyse Error Trends",
      description:
        "Analyse error trends over time to identify patterns and spikes",
      inputSchema: {
        timeRange: z
          .string()
          .optional()
          .default("24h")
          .describe('Time range to analyse (e.g., "1h", "24h", "7d")'),
        serviceFilter: z.string().optional().describe("Filter by service name"),
        resolution: z
          .enum(["1m", "5m", "1h", "1d"])
          .optional()
          .default("1h")
          .describe("Time resolution for trend analysis"),
      },
    },
    async ({ timeRange, serviceFilter, resolution }) => {
      try {
        const projectId = await getProjectId();
        // Initialize Google Auth client (same pattern as trace service)
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access error reporting data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Parse time range - ensure we have a valid timeRange value
        const actualTimeRange = timeRange || "24h";
        const actualResolution = resolution || "1h";

        // Map time range to Google Cloud Error Reporting periods
        let period: string;
        switch (actualTimeRange) {
          case "1h":
            period = "PERIOD_1_HOUR";
            break;
          case "6h":
            period = "PERIOD_6_HOURS";
            break;
          case "24h":
          case "1d":
            period = "PERIOD_1_DAY";
            break;
          case "7d":
            period = "PERIOD_1_WEEK";
            break;
          case "30d":
            period = "PERIOD_30_DAYS";
            break;
          default:
            // Default to 1 day for trend analysis
            period = "PERIOD_1_DAY";
            break;
        }

        // Calculate timed count duration based on resolution
        let timedCountDuration: string;
        switch (actualResolution) {
          case "1m":
            timedCountDuration = "60s";
            break;
          case "5m":
            timedCountDuration = "300s";
            break;
          case "1h":
            timedCountDuration = "3600s";
            break;
          case "1d":
            timedCountDuration = "86400s";
            break;
          default:
            timedCountDuration = "3600s"; // Default to 1 hour
            break;
        }

        // Build query parameters for trends analysis
        const params = new URLSearchParams({
          "timeRange.period": period,
          timedCountDuration: timedCountDuration,
          order: "COUNT_DESC",
          pageSize: "50",
        });

        // Add service filter if provided
        if (serviceFilter) {
          params.set("serviceFilter.service", serviceFilter);
        }

        // Make REST API call for trends
        const apiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${projectId}/groupStats?${params}`;
        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new GcpMcpError(
            `Failed to fetch error trends: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data = await response.json();
        const errorGroupStats = data.errorGroupStats || [];

        if (!errorGroupStats || errorGroupStats.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Error Trends Analysis\n\nProject: ${projectId}\nTime Range: ${actualTimeRange}\n${serviceFilter ? `Service Filter: ${serviceFilter}\n` : ""}\nResolution: ${actualResolution}\n\nNo error data found for trend analysis.`,
              },
            ],
          };
        }

        let content = `# Error Trends Analysis\n\nProject: ${projectId}\nTime Range: ${actualTimeRange}\n${serviceFilter ? `Service Filter: ${serviceFilter}\n` : ""}\nResolution: ${actualResolution}\n\n`;

        // Aggregate trends across all error groups
        const timeSlots = new Map<string, number>();
        let totalErrors = 0;
        const totalGroups = errorGroupStats.length;

        errorGroupStats.forEach((stat: any) => {
          const count = parseInt(stat.count || "0");
          totalErrors += count;

          if (stat.timedCounts) {
            stat.timedCounts.forEach((timedCount: any) => {
              const timeKey = timedCount.startTime;
              const currentCount = timeSlots.get(timeKey) || 0;
              timeSlots.set(
                timeKey,
                currentCount + parseInt(timedCount.count || "0"),
              );
            });
          }
        });

        content += `## Summary\n\n`;
        content += `- **Total Error Groups:** ${totalGroups}\n`;
        content += `- **Total Errors:** ${totalErrors.toLocaleString()}\n`;
        content += `- **Average per Group:** ${Math.round(totalErrors / totalGroups).toLocaleString()}\n\n`;

        // Sort time slots chronologically
        const sortedTimeSlots = Array.from(timeSlots.entries()).sort(
          ([a], [b]) => new Date(a).getTime() - new Date(b).getTime(),
        );

        // Initialize variables for recommendations
        let averageErrors = 0;
        let spikes: Array<[string, number]> = [];

        if (sortedTimeSlots.length > 0) {
          content += `## Error Count Over Time\n\n`;
          content += `| Time Period | Error Count |\n`;
          content += `|-------------|-------------|\n`;

          sortedTimeSlots.forEach(([time, count]) => {
            const timeStr = new Date(time).toLocaleString();
            content += `| ${timeStr} | ${count.toLocaleString()} |\n`;
          });

          content += `\n`;

          // Identify spikes (errors significantly above average)
          averageErrors = totalErrors / sortedTimeSlots.length;
          spikes = sortedTimeSlots.filter(
            ([, count]) => count > averageErrors * 2,
          );

          if (spikes.length > 0) {
            content += `## Error Spikes Detected\n\n`;
            content += `*Time periods with error counts > 2x average (${Math.round(averageErrors)})*\n\n`;
            spikes.forEach(([time, count]) => {
              const timeStr = new Date(time).toLocaleString();
              const multiplier = Math.round((count / averageErrors) * 10) / 10;
              content += `- **${timeStr}:** ${count.toLocaleString()} errors (${multiplier}x average)\n`;
            });
            content += `\n`;
          }
        }

        // Top error groups contributing to trends
        content += `## Top Contributing Error Groups\n\n`;
        const topErrors = errorGroupStats.slice(0, 5).map((stat: any) => ({
          service: stat.representative?.serviceContext?.service || "Unknown",
          message: stat.representative?.message || "No message",
          count: parseInt(stat.count || "0"),
          groupId: stat.group?.groupId || "unknown",
        }));

        topErrors.forEach(
          (
            error: {
              service: string;
              message: string;
              count: number;
              groupId: string;
            },
            index: number,
          ) => {
            const percentage = Math.round((error.count / totalErrors) * 100);
            content += `${index + 1}. **${error.service}** (${percentage}% of total)\n`;
            content += `   - ${error.message}\n`;
            content += `   - ${error.count.toLocaleString()} occurrences\n`;
            content += `   - Group ID: ${error.groupId}\n\n`;
          },
        );

        // Recommendations based on trends
        content += `## Recommendations\n\n`;
        if (spikes.length > 0) {
          content += `- **Investigate Error Spikes:** Focus on the ${spikes.length} time periods with significantly elevated error rates\n`;
          content += `- **Correlate with Deployments:** Check if error spikes align with recent deployments or configuration changes\n`;
        }
        content += `- **Monitor Top Contributors:** The top ${Math.min(3, topErrors.length)} error groups account for the majority of errors\n`;
        content += `- **Set Up Alerting:** Configure alerts for error rates exceeding ${Math.round(averageErrors * 1.5)} errors per ${resolution}\n`;
        content += `- **Review Patterns:** Look for recurring patterns in error timing to identify systemic issues\n`;

        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to analyse error trends: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );
}
