/**
 * Google Cloud Monitoring resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import { formatTimeSeriesData, getMonitoringClient } from "./types.js";

/**
 * Registers Google Cloud Monitoring resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerMonitoringResources(server: McpServer): void {
  // Register a resource for recent metrics
  server.resource(
    "gcp-monitoring-recent-metrics",
    new ResourceTemplate("gcp-monitoring://{projectId}/recent", {
      list: undefined,
    }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());
        const client = getMonitoringClient();

        // Default filter from environment variable or use a common metric
        const defaultFilter =
          process.env.MONITORING_FILTER ||
          'metric.type="compute.googleapis.com/instance/cpu/utilization"';

        // Create time range for the last hour
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const [timeSeries] = await client.listTimeSeries({
          name: `projects/${actualProjectId}`,
          filter: defaultFilter,
          interval: {
            startTime: {
              seconds: Math.floor(oneHourAgo.getTime() / 1000),
              nanos: 0,
            },
            endTime: {
              seconds: Math.floor(now.getTime() / 1000),
              nanos: 0,
            },
          },
        });

        if (!timeSeries || timeSeries.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Recent Metrics for Project: ${actualProjectId}\n\nNo metrics found matching filter: ${defaultFilter}`,
              },
            ],
          };
        }

        const formattedData = formatTimeSeriesData(timeSeries);

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Recent Metrics for Project: ${actualProjectId}\n\nFilter: ${defaultFilter}\nTime Range: ${oneHourAgo.toISOString()} to ${now.toISOString()}\n\n${formattedData}`,
            },
          ],
        };
      } catch (error: any) {
        throw new GcpMcpError(
          `Failed to retrieve recent metrics: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );

  // Register a resource for metrics with a custom filter
  server.resource(
    "gcp-monitoring-filtered-metrics",
    new ResourceTemplate("gcp-monitoring://{projectId}/filter/{filter}", {
      list: undefined,
    }),
    async (uri, { projectId, filter }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());
        const client = getMonitoringClient();

        if (!filter) {
          throw new GcpMcpError(
            "Metric filter is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        const decodedFilter = Array.isArray(filter)
          ? decodeURIComponent(filter[0])
          : decodeURIComponent(filter);

        // Create time range for the last hour
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const [timeSeries] = await client.listTimeSeries({
          name: `projects/${actualProjectId}`,
          filter: decodedFilter,
          interval: {
            startTime: {
              seconds: Math.floor(oneHourAgo.getTime() / 1000),
              nanos: 0,
            },
            endTime: {
              seconds: Math.floor(now.getTime() / 1000),
              nanos: 0,
            },
          },
        });

        if (!timeSeries || timeSeries.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Filtered Metrics for Project: ${actualProjectId}\n\nNo metrics found matching filter: ${decodedFilter}`,
              },
            ],
          };
        }

        const formattedData = formatTimeSeriesData(timeSeries);

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Filtered Metrics for Project: ${actualProjectId}\n\nFilter: ${decodedFilter}\nTime Range: ${oneHourAgo.toISOString()} to ${now.toISOString()}\n\n${formattedData}`,
            },
          ],
        };
      } catch (error: any) {
        throw new GcpMcpError(
          `Failed to retrieve filtered metrics: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );
}
