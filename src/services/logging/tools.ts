/**
 * Google Cloud Logging tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId } from "../../utils/auth.js";
import { formatLogEntry, getLoggingClient, LogEntry } from "./types.js";
import { parseRelativeTime } from "../../utils/time.js";

/**
 * Registers Google Cloud Logging tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerLoggingTools(server: McpServer): void {
  // Tool to query logs with a custom filter
  server.registerTool(
    "gcp-logging-query-logs",
    {
      title: "Query Logs",
      description:
        "Query Google Cloud Logs with custom filters. Searches across all payload types (text, JSON, proto) and metadata fields.",
      inputSchema: {
        filter: z
          .string()
          .describe(
            "The filter to apply to logs (Cloud Logging query language)",
          ),
        limit: z
          .number()
          .min(1)
          .max(1000)
          .default(50)
          .describe("Maximum number of log entries to return"),
      },
    },
    async ({ filter, limit }) => {
      try {
        const projectId = await getProjectId();
        const logging = getLoggingClient();

        const [entries] = await logging.getEntries({
          pageSize: limit,
          filter,
        });

        if (!entries || entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No log entries found matching filter: ${filter}`,
              },
            ],
          };
        }

        const formattedLogs = entries
          .map((entry) => {
            try {
              return formatLogEntry(entry as unknown as LogEntry);
            } catch (err: unknown) {
              const errorMessage =
                err instanceof Error ? err.message : "Unknown error";
              return `## Error Formatting Log Entry\n\nAn error occurred while formatting a log entry: ${errorMessage}`;
            }
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# Log Query Results\n\nProject: ${projectId}\nFilter: ${filter}\nEntries: ${entries.length}\n\n${formattedLogs}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Return a user-friendly error message instead of throwing
        return {
          content: [
            {
              type: "text",
              text: `# Error Querying Logs

An error occurred while querying logs: ${errorMessage}

Please check your filter syntax and try again. For filter syntax help, see: https://cloud.google.com/logging/docs/view/logging-query-language`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool to get logs for a specific time range
  server.registerTool(
    "gcp-logging-query-time-range",
    {
      title: "Query Logs by Time Range",
      description:
        "Query Google Cloud Logs within a specific time range. Supports relative times (1h, 2d) and ISO timestamps.",
      inputSchema: {
        startTime: z
          .string()
          .describe(
            'Start time in ISO format or relative time (e.g., "1h", "2d")',
          ),
        endTime: z
          .string()
          .optional()
          .describe("End time in ISO format (defaults to now)"),
        filter: z.string().optional().describe("Additional filter criteria"),
        limit: z
          .number()
          .min(1)
          .max(1000)
          .default(50)
          .describe("Maximum number of log entries to return"),
      },
    },
    async ({ startTime, endTime, filter, limit }) => {
      try {
        const projectId = await getProjectId();
        const logging = getLoggingClient();

        const start = parseRelativeTime(startTime);
        const end = endTime ? parseRelativeTime(endTime) : new Date();

        // Build filter string
        let filterStr = `timestamp >= "${start.toISOString()}" AND timestamp <= "${end.toISOString()}"`;
        if (filter) {
          filterStr = `${filterStr} AND ${filter}`;
        }

        const [entries] = await logging.getEntries({
          pageSize: limit,
          filter: filterStr,
        });

        if (!entries || entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No log entries found in the specified time range with filter: ${filterStr}`,
              },
            ],
          };
        }

        const formattedLogs = entries
          .map((entry) => {
            try {
              return formatLogEntry(entry as unknown as LogEntry);
            } catch (err: unknown) {
              const errorMessage =
                err instanceof Error ? err.message : "Unknown error";
              return `## Error Formatting Log Entry\n\nAn error occurred while formatting a log entry: ${errorMessage}`;
            }
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# Log Time Range Results\n\nProject: ${projectId}\nTime Range: ${start.toISOString()} to ${end.toISOString()}\nFilter: ${filter || "None"}\nEntries: ${entries.length}\n\n${formattedLogs}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Return a user-friendly error message instead of throwing
        return {
          content: [
            {
              type: "text",
              text: `# Error Querying Logs

An error occurred while querying logs: ${errorMessage}

Please check your time range format and try again. Valid formats include:
- ISO date strings (e.g., "2025-03-01T00:00:00Z")
- Relative time expressions: "1h" (1 hour ago), "2d" (2 days ago), "1w" (1 week ago), etc.`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Advanced tool for searching across all payload types and fields
  server.registerTool(
    "gcp-logging-search-comprehensive",
    {
      title: "Comprehensive Log Search",
      description:
        "Search across all log fields including textPayload, jsonPayload, protoPayload, labels, HTTP requests, and metadata. Provides maximum context.",
      inputSchema: {
        searchTerm: z
          .string()
          .describe("Term to search for across all payload types and fields"),
        timeRange: z
          .string()
          .default("1h")
          .describe('Time range to search (e.g., "1h", "24h", "7d")'),
        severity: z
          .enum([
            "DEFAULT",
            "DEBUG",
            "INFO",
            "NOTICE",
            "WARNING",
            "ERROR",
            "CRITICAL",
            "ALERT",
            "EMERGENCY",
          ])
          .optional()
          .describe("Minimum severity level to filter by"),
        resource: z
          .string()
          .optional()
          .describe(
            'Resource type to filter by (e.g., "cloud_function", "gke_container")',
          ),
        limit: z
          .number()
          .min(1)
          .max(500)
          .default(50)
          .describe("Maximum number of log entries to return"),
      },
    },
    async ({ searchTerm, timeRange, severity, resource, limit }) => {
      try {
        const projectId = await getProjectId();
        const logging = getLoggingClient();

        const endTime = new Date();
        const startTime = parseRelativeTime(timeRange);

        // Build comprehensive search filter that searches across all payload types
        const filterParts = [
          `timestamp >= "${startTime.toISOString()}"`,
          `timestamp <= "${endTime.toISOString()}"`,
        ];

        // Add search term across multiple payload types and fields
        const searchParts = [
          `textPayload:("${searchTerm}")`,
          `jsonPayload.message:("${searchTerm}")`,
          `jsonPayload.msg:("${searchTerm}")`,
          `jsonPayload.error:("${searchTerm}")`,
          `jsonPayload.exception:("${searchTerm}")`,
          `jsonPayload.stack:("${searchTerm}")`,
          `jsonPayload.stackTrace:("${searchTerm}")`,
          `jsonPayload.description:("${searchTerm}")`,
          `jsonPayload.details:("${searchTerm}")`,
          `jsonPayload.reason:("${searchTerm}")`,
          `jsonPayload.code:("${searchTerm}")`,
          `jsonPayload.status:("${searchTerm}")`,
          `jsonPayload.method:("${searchTerm}")`,
          `jsonPayload.url:("${searchTerm}")`,
          `jsonPayload.path:("${searchTerm}")`,
          `jsonPayload.endpoint:("${searchTerm}")`,
          `jsonPayload.service:("${searchTerm}")`,
          `jsonPayload.operation:("${searchTerm}")`,
          `jsonPayload.function:("${searchTerm}")`,
          `jsonPayload.name:("${searchTerm}")`,
          `jsonPayload.type:("${searchTerm}")`,
          `jsonPayload.level:("${searchTerm}")`,
          `jsonPayload.category:("${searchTerm}")`,
          `jsonPayload.component:("${searchTerm}")`,
          `jsonPayload.module:("${searchTerm}")`,
          `jsonPayload.class:("${searchTerm}")`,
          `jsonPayload.thread:("${searchTerm}")`,
          `jsonPayload.user:("${searchTerm}")`,
          `jsonPayload.userId:("${searchTerm}")`,
          `jsonPayload.sessionId:("${searchTerm}")`,
          `jsonPayload.requestId:("${searchTerm}")`,
          `jsonPayload.traceId:("${searchTerm}")`,
          `jsonPayload.spanId:("${searchTerm}")`,
          `jsonPayload.host:("${searchTerm}")`,
          `jsonPayload.hostname:("${searchTerm}")`,
          `jsonPayload.ip:("${searchTerm}")`,
          `jsonPayload.port:("${searchTerm}")`,
          `protoPayload.methodName:("${searchTerm}")`,
          `protoPayload.serviceName:("${searchTerm}")`,
          `protoPayload.resourceName:("${searchTerm}")`,
          `labels.service:("${searchTerm}")`,
          `labels.version:("${searchTerm}")`,
          `labels.environment:("${searchTerm}")`,
          `labels.region:("${searchTerm}")`,
          `labels.zone:("${searchTerm}")`,
          `httpRequest.requestUrl:("${searchTerm}")`,
          `httpRequest.userAgent:("${searchTerm}")`,
          `httpRequest.remoteIp:("${searchTerm}")`,
          `httpRequest.referer:("${searchTerm}")`,
          `sourceLocation.file:("${searchTerm}")`,
          `sourceLocation.function:("${searchTerm}")`,
          `operation.id:("${searchTerm}")`,
          `operation.producer:("${searchTerm}")`,
        ];

        filterParts.push(`(${searchParts.join(" OR ")})`);

        // Add severity filter if specified
        if (severity) {
          filterParts.push(`severity >= ${severity}`);
        }

        // Add resource filter if specified
        if (resource) {
          filterParts.push(`resource.type = "${resource}"`);
        }

        const filter = filterParts.join(" AND ");

        const [entries] = await logging.getEntries({
          pageSize: limit,
          filter,
          orderBy: "timestamp desc",
        });

        if (!entries || entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Comprehensive Log Search Results\n\nProject: ${projectId}\nSearch Term: "${searchTerm}"\nTime Range: ${startTime.toISOString()} to ${endTime.toISOString()}\nSeverity: ${severity || "All levels"}\nResource: ${resource || "All resources"}\n\n**No matching log entries found.**\n\nThe search looked across:\n- Text payloads\n- JSON payload fields (message, error, exception, etc.)\n- Proto payload fields\n- Labels\n- HTTP request details\n- Source location\n- Operation details`,
              },
            ],
          };
        }

        const formattedLogs = entries
          .map((entry) => {
            try {
              return formatLogEntry(entry as unknown as LogEntry);
            } catch (err: unknown) {
              const errorMessage =
                err instanceof Error ? err.message : "Unknown error";
              return `## Error Formatting Log Entry\n\nAn error occurred while formatting a log entry: ${errorMessage}`;
            }
          })
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `# Comprehensive Log Search Results\n\nProject: ${projectId}\nSearch Term: "${searchTerm}"\nTime Range: ${startTime.toISOString()} to ${endTime.toISOString()}\nSeverity: ${severity || "All levels"}\nResource: ${resource || "All resources"}\nEntries Found: ${entries.length}\n\n**Search Coverage:**\nThis search looked across all payload types and fields including:\n- Text payloads\n- JSON payload fields (message, error, exception, stack traces, HTTP details, etc.)\n- Proto payload fields\n- Labels and metadata\n- HTTP request details\n- Source location information\n- Operation details\n\n---\n\n${formattedLogs}`,
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        return {
          content: [
            {
              type: "text",
              text: `# Error in Comprehensive Log Search\n\nAn error occurred while searching logs: ${errorMessage}\n\nPlease check your search parameters and try again.`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
