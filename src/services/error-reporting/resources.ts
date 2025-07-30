/**
 * Google Cloud Error Reporting resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId, initGoogleAuth } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import {
  analyseErrorPatternsAndSuggestRemediation,
  ErrorGroupStats,
} from "./types.js";

/**
 * Registers Google Cloud Error Reporting resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerErrorReportingResources(server: McpServer): void {
  // Register a resource for recent error analysis
  server.resource(
    "gcp-error-reporting-recent-errors",
    new ResourceTemplate("gcp-error-reporting://{projectId}/recent", {
      list: undefined,
    }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());

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

        // Build query parameters using predefined period (1 hour)
        const params = new URLSearchParams({
          "timeRange.period": "PERIOD_1_HOUR",
          order: "COUNT_DESC",
          pageSize: "20",
        });

        // Make REST API call
        const apiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${actualProjectId}/groupStats?${params}`;
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
            `Failed to fetch recent errors: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data = await response.json();
        const errorGroupStats = data.errorGroupStats || [];

        if (!errorGroupStats || errorGroupStats.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/markdown",
                text: `# Recent Error Analysis\n\nProject: ${actualProjectId}\nTime Range: Last 1 hour\n\nNo errors found in the last hour. 🎉`,
              },
            ],
          };
        }

        // errorGroupStats should already match our ErrorGroupStats interface
        const errorSummaries: ErrorGroupStats[] = errorGroupStats;

        const analysis =
          analyseErrorPatternsAndSuggestRemediation(errorSummaries);

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: `# Recent Error Analysis\n\nProject: ${actualProjectId}\nTime Range: Last 1 hour\n\n${analysis}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch recent errors: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Register a resource for error analysis with custom time range
  server.resource(
    "gcp-error-reporting-error-analysis",
    new ResourceTemplate(
      "gcp-error-reporting://{projectId}/analysis/{timeRange}",
      { list: undefined },
    ),
    async (uri, { projectId, timeRange }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());
        const actualTimeRange = Array.isArray(timeRange)
          ? timeRange[0]
          : timeRange || "1h";
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
            // Default to 1 hour for error analysis
            period = "PERIOD_1_HOUR";
            break;
        }

        // Build query parameters
        const params = new URLSearchParams({
          "timeRange.period": period,
          order: "COUNT_DESC",
          pageSize: "50",
        });

        // Make REST API call
        const apiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${actualProjectId}/groupStats?${params}`;
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
            `Failed to fetch error analysis: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data = await response.json();
        const errorGroupStats = data.errorGroupStats || [];

        if (!errorGroupStats || errorGroupStats.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/markdown",
                text: `# Error Analysis\n\nProject: ${actualProjectId}\nTime Range: ${actualTimeRange}\n\nNo errors found in the specified time range.`,
              },
            ],
          };
        }

        // errorGroupStats should already match our ErrorGroupStats interface
        const errorSummaries: ErrorGroupStats[] = errorGroupStats;

        const analysis =
          analyseErrorPatternsAndSuggestRemediation(errorSummaries);

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: `# Error Analysis\n\nProject: ${actualProjectId}\nTime Range: ${actualTimeRange}\n\n${analysis}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch error analysis: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Register a resource for service-specific error analysis
  server.resource(
    "gcp-error-reporting-service-errors",
    new ResourceTemplate(
      "gcp-error-reporting://{projectId}/service/{serviceName}",
      { list: undefined },
    ),
    async (uri, { projectId, serviceName }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());
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

        // Build query parameters (analyse errors for the last 24 hours for this service)
        const actualServiceName = Array.isArray(serviceName)
          ? serviceName[0]
          : serviceName;
        const params = new URLSearchParams({
          "timeRange.period": "PERIOD_1_DAY",
          "serviceFilter.service": actualServiceName,
          order: "COUNT_DESC",
          pageSize: "30",
        });

        // Make REST API call
        const apiUrl = `https://clouderrorreporting.googleapis.com/v1beta1/projects/${actualProjectId}/groupStats?${params}`;
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
            `Failed to fetch service errors: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data = await response.json();
        const errorGroupStats = data.errorGroupStats || [];

        if (!errorGroupStats || errorGroupStats.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "text/markdown",
                text: `# Service Error Analysis\n\nProject: ${actualProjectId}\nService: ${actualServiceName}\nTime Range: Last 24 hours\n\nNo errors found for this service in the last 24 hours. 🎉`,
              },
            ],
          };
        }

        // errorGroupStats should already match our ErrorGroupStats interface
        const errorSummaries: ErrorGroupStats[] = errorGroupStats;

        const analysis =
          analyseErrorPatternsAndSuggestRemediation(errorSummaries);

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: `# Service Error Analysis\n\nProject: ${actualProjectId}\nService: ${actualServiceName}\nTime Range: Last 24 hours\n\n${analysis}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch service errors: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );
}
