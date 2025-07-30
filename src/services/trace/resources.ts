/**
 * Google Cloud Trace resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId, initGoogleAuth } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import { buildTraceHierarchy, formatTraceData } from "./types.js";
import { LogEntry } from "../logging/types.js";
import { logger } from "../../utils/logger.js";

/**
 * Registers Google Cloud Trace resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerTraceResources(server: McpServer): void {
  // Resource to get a specific trace by ID
  server.resource(
    "gcp-trace-get-by-id",
    new ResourceTemplate("gcp-trace://{projectId}/traces/{traceId}", {
      list: undefined,
    }),
    async (uri, { projectId, traceId }, context) => {
      try {
        // Use provided project ID or get the default one
        const actualProjectId = projectId || (await getProjectId());

        // Validate trace ID format (hex string)
        if (typeof traceId === "string" && !traceId.match(/^[a-f0-9]+$/i)) {
          throw new GcpMcpError(
            "Invalid trace ID format. Trace ID should be a hexadecimal string.",
            "INVALID_ARGUMENT",
            400,
          );
        }

        // Initialize Google Auth client
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access trace data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Fetch the trace from the Cloud Trace API
        const response = await fetch(
          `https://cloudtrace.googleapis.com/v1/projects/${actualProjectId}/traces/${traceId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token.token}`,
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new GcpMcpError(
            `Failed to fetch trace: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const traceData = await response.json();

        if (!traceData || !traceData.spans || traceData.spans.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Trace Not Found\n\nNo trace found with ID: ${traceId} in project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Build the trace hierarchy
        const hierarchicalTrace = buildTraceHierarchy(
          actualProjectId.toString(),
          traceId.toString(),
          traceData.spans,
        );

        // Format the trace data for display
        const formattedTrace = formatTraceData(hierarchicalTrace);

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Trace Details for ${traceId}\n\n${formattedTrace}`,
            },
          ],
        };
      } catch (error: any) {
        // Error handling for trace-by-id resource
        throw new GcpMcpError(
          `Failed to fetch trace: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );

  // Resource to get logs associated with a trace
  server.resource(
    "gcp-trace-related-logs",
    new ResourceTemplate("gcp-trace://{projectId}/traces/{traceId}/logs", {
      list: undefined,
    }),
    async (uri, { projectId, traceId }, context) => {
      try {
        // Use provided project ID or get the default one
        const actualProjectId = projectId || (await getProjectId());

        // Validate trace ID format (hex string)
        if (typeof traceId === "string" && !traceId.match(/^[a-f0-9]+$/i)) {
          throw new GcpMcpError(
            "Invalid trace ID format. Trace ID should be a hexadecimal string.",
            "INVALID_ARGUMENT",
            400,
          );
        }

        // Import the Logging client
        const { Logging } = await import("@google-cloud/logging");

        // Initialize the logging client
        const logging = new Logging({
          projectId:
            typeof actualProjectId === "string" ? actualProjectId : undefined,
        });

        // Create a more flexible filter that searches for the trace ID in multiple fields
        const traceFilter = `
          (trace="projects/${actualProjectId}/traces/${traceId}" OR 
           jsonPayload.logging.googleapis.com/trace="projects/${actualProjectId}/traces/${traceId}" OR 
           labels."logging.googleapis.com/trace_id"="${traceId}" OR
           labels."trace_id"="${traceId}" OR
           jsonPayload.trace_id="${traceId}")
        `
          .replace(/\s+/g, " ")
          .trim();

        // Fetch logs with the flexible filter
        const [entries] = await logging.getEntries({
          pageSize: 50,
          filter: traceFilter,
        });

        if (!entries || entries.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# No Logs Found for Trace

No log entries found associated with trace ID: ${traceId} in project: ${actualProjectId}

Filter used: ${traceFilter}`,
              },
            ],
          };
        }

        // Format logs
        let formattedLogs = "";
        for (const entry of entries) {
          // Cast the entry to our LogEntry type to access properties safely
          const logEntry = entry as unknown as LogEntry;

          // Safely extract timestamp
          let timestamp = "Unknown time";
          if (logEntry.timestamp) {
            try {
              const date = new Date(logEntry.timestamp);
              if (!isNaN(date.getTime())) {
                timestamp = date.toISOString();
              }
            } catch (e) {
              // Keep default timestamp if parsing fails
            }
          }

          const severity = logEntry.severity || "DEFAULT";
          const message =
            logEntry.jsonPayload &&
            typeof logEntry.jsonPayload === "object" &&
            "message" in logEntry.jsonPayload
              ? String(logEntry.jsonPayload.message)
              : logEntry.textPayload ||
                JSON.stringify(logEntry.jsonPayload || {});

          formattedLogs += `## Log Entry (${severity}) - ${timestamp}\n\n`;
          formattedLogs += `${message}\n\n`;

          // Add resource information if available
          if (logEntry.resource && typeof logEntry.resource === "object") {
            const resource = logEntry.resource as {
              type?: string;
              labels?: Record<string, string>;
            };

            if (resource.type) {
              formattedLogs += `**Resource**: ${resource.type}\n`;
            }

            if (resource.labels && typeof resource.labels === "object") {
              formattedLogs += `**Labels**:\n`;
              for (const [key, value] of Object.entries(resource.labels)) {
                formattedLogs += `- ${key}: ${value}\n`;
              }
            }
            formattedLogs += "\n";
          }

          // Add log-specific labels if available
          if (
            logEntry.labels &&
            typeof logEntry.labels === "object" &&
            Object.keys(logEntry.labels).length > 0
          ) {
            formattedLogs += `**Log Labels**:\n`;
            for (const [key, value] of Object.entries(logEntry.labels)) {
              formattedLogs += `- ${key}: ${value}\n`;
            }
            formattedLogs += "\n";
          }

          formattedLogs += "---\n\n";
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: `# Logs for Trace: ${traceId}\n\nProject: ${actualProjectId}\nTotal Log Entries: ${entries.length}\n\n${formattedLogs}`,
            },
          ],
        };
      } catch (error: any) {
        // Error handling
        throw new GcpMcpError(
          `Failed to fetch logs for trace: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );

  // Resource to list recent failed traces
  server.resource(
    "gcp-trace-recent-failed",
    new ResourceTemplate("gcp-trace://{projectId}/recent-failed", {
      list: undefined,
    }),
    async (uri, { projectId }, context) => {
      try {
        // Use provided project ID or get the default one
        const actualProjectId = projectId || (await getProjectId());

        // Calculate time range (last 1 hour)
        const endTime = new Date();
        let startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 1 hour ago

        // Check if we have a startTime parameter in the URI query
        const uriParams = new URL(uri.href).searchParams;
        const startTimeParam = uriParams.get("startTime");

        if (startTimeParam) {
          logger.debug(`Found startTime parameter in URI: ${startTimeParam}`);

          // Check if it's a relative time format (e.g., "1h", "2d", "30m")
          const relativeTimeRegex = /^(\d+)([hmd])$/;
          const match = startTimeParam.match(relativeTimeRegex);

          if (match) {
            // Parse relative time (e.g., "1h", "2d")
            const value = parseInt(match[1]);
            const unit = match[2];

            startTime = new Date(endTime);
            if (unit === "h") {
              startTime.setHours(startTime.getHours() - value);
            } else if (unit === "d") {
              startTime.setDate(startTime.getDate() - value);
            } else if (unit === "m") {
              startTime.setMinutes(startTime.getMinutes() - value);
            }

            logger.debug(
              `Parsed relative time: ${startTimeParam} to ${startTime.toISOString()}`,
            );
          } else {
            // Try to parse as ISO format
            try {
              const parsedDate = new Date(startTimeParam);
              if (!isNaN(parsedDate.getTime())) {
                startTime = parsedDate;
                logger.debug(
                  `Parsed ISO time: ${startTimeParam} to ${startTime.toISOString()}`,
                );
              } else {
                logger.error(
                  `Invalid date format: ${startTimeParam}, using default`,
                );
              }
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logger.error(
                `Error parsing time: ${errorMessage}, using default`,
              );
            }
          }
        }

        // Build the filter for failed traces
        const filter = {
          projectId: actualProjectId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          filter: "status.code != 0", // Non-zero status codes indicate errors
          pageSize: 10, // Limit to 10 traces
        };

        // Initialize Google Auth client
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access trace data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Build the query parameters for the request
        const queryParams = new URLSearchParams();

        // Format timestamps in RFC3339 UTC "Zulu" format as required by the API
        // Example format: "2014-10-02T15:01:23Z"
        const startTimeUTC = new Date(filter.startTime).toISOString();
        const endTimeUTC = new Date(filter.endTime).toISOString();

        // Build the query parameters for the request according to the API documentation
        // Required parameters
        queryParams.append("startTime", startTimeUTC); // Start of the time interval (inclusive)
        queryParams.append("endTime", endTimeUTC); // End of the time interval (inclusive)

        // Optional parameters
        queryParams.append("pageSize", filter.pageSize.toString()); // Maximum number of traces to return
        queryParams.append("filter", filter.filter); // Filter for failed traces (status.code != 0)
        queryParams.append("view", "MINIMAL"); // Type of data returned (MINIMAL, ROOTSPAN, COMPLETE)

        // Construct the URL for the Cloud Trace API v1 endpoint
        // The correct endpoint format according to the documentation is:
        // GET https://cloudtrace.googleapis.com/v1/projects/{projectId}/traces
        const apiUrl = `https://cloudtrace.googleapis.com/v1/projects/${actualProjectId}/traces`;
        const requestUrl = `${apiUrl}?${queryParams.toString()}`;

        logger.debug(`Recent Failed Traces URL: ${requestUrl}`);
        logger.debug(
          `Recent Failed Traces Query Params: ${JSON.stringify(Object.fromEntries(queryParams.entries()))}`,
        );

        // Fetch failed traces from the Cloud Trace API using the correct v1 endpoint
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/json",
          },
        });

        logger.debug(
          `Recent Failed Traces Response Status: ${response.status}`,
        );

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Recent Failed Traces Error: ${errorText}`);
          throw new GcpMcpError(
            `Failed to fetch failed traces: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const tracesData = await response.json();

        if (!tracesData.traces || tracesData.traces.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Recent Failed Traces\n\nNo failed traces found in the last hour for project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Format the traces for display
        let markdown = `# Recent Failed Traces\n\n`;
        markdown += `Project: ${actualProjectId}\n`;
        markdown += `Time Range: ${startTime.toISOString()} to ${endTime.toISOString()}\n\n`;
        markdown += `Found ${tracesData.traces.length} failed traces:\n\n`;

        // Table header
        markdown +=
          "| Trace ID | Display Name | Start Time | Duration | Error |\n";
        markdown +=
          "|----------|--------------|------------|----------|-------|\n";

        // Table rows
        for (const trace of tracesData.traces) {
          const traceId = trace.traceId;
          const displayName = trace.displayName || "Unknown";
          const startTimeStr = new Date(trace.startTime).toISOString();
          const duration = calculateDuration(trace.startTime, trace.endTime);
          const error = trace.status?.message || "Unknown error";

          markdown += `| [${traceId}](gcp-trace://${actualProjectId}/traces/${traceId}) | ${displayName} | ${startTimeStr} | ${duration} | ${error} |\n`;
        }

        return {
          contents: [
            {
              uri: uri.href,
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        // Error handling for recent-failed-traces resource
        throw new GcpMcpError(
          `Failed to fetch failed traces: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );
}

/**
 * Calculates the duration between two timestamps
 *
 * @param startTime The start time
 * @param endTime The end time
 * @returns Formatted duration string
 */
function calculateDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
}
