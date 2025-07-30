/**
 * Google Cloud Logging resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import { formatLogEntry, getLoggingClient, LogEntry } from "./types.js";

/**
 * Registers Google Cloud Logging resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerLoggingResources(server: McpServer): void {
  // Register a resource for listing recent logs
  server.resource(
    "gcp-logging-recent-logs",
    new ResourceTemplate("gcp-logs://{projectId}/recent", { list: undefined }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());
        const logging = getLoggingClient();

        const defaultFilter = process.env.LOG_FILTER || "";
        const [entries] = await logging.getEntries({
          pageSize: 50,
          filter: defaultFilter,
        });

        if (!entries || entries.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: "No log entries found.",
              },
            ],
          };
        }

        // Format logs with error handling for each entry
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
          contents: [
            {
              uri: uri.href,
              text: `# Recent Logs for Project: ${actualProjectId}\n\n${formattedLogs}`,
            },
          ],
        };
      } catch (error: unknown) {
        // Get project ID safely
        let projectIdForError: string;
        try {
          projectIdForError = Array.isArray(projectId)
            ? projectId[0]
            : (projectId as string) ||
              process.env.GOOGLE_CLOUD_PROJECT ||
              "unknown";
        } catch {
          projectIdForError = "unknown";
        }

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Return a user-friendly error message instead of throwing
        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Recent Logs\n\nAn error occurred while fetching recent logs for project ${projectIdForError}: ${errorMessage}\n\nPlease check your Google Cloud credentials and project configuration.`,
            },
          ],
        };
      }
    },
  );

  // Register a resource for querying logs with a filter
  server.resource(
    "gcp-logging-filtered-logs",
    new ResourceTemplate("gcp-logs://{projectId}/filter/{filter}", {
      list: undefined,
    }),
    async (uri, { projectId, filter }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());
        const logging = getLoggingClient();

        if (!filter) {
          throw new GcpMcpError(
            "Log filter is required",
            "INVALID_ARGUMENT",
            400,
          );
        }

        const decodedFilter = Array.isArray(filter)
          ? decodeURIComponent(filter[0])
          : decodeURIComponent(filter);

        const [entries] = await logging.getEntries({
          pageSize: 50,
          filter: decodedFilter,
        });

        if (!entries || entries.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `No log entries found matching filter: ${decodedFilter}`,
              },
            ],
          };
        }

        // Format logs with error handling for each entry
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
          contents: [
            {
              uri: uri.href,
              text: `# Filtered Logs for Project: ${actualProjectId}\n\nFilter: ${decodedFilter}\n\n${formattedLogs}`,
            },
          ],
        };
      } catch (error: unknown) {
        // Get project ID and filter safely
        let projectIdForError: string;
        let filterForError: string;
        try {
          projectIdForError = Array.isArray(projectId)
            ? projectId[0]
            : (projectId as string) ||
              process.env.GOOGLE_CLOUD_PROJECT ||
              "unknown";
          filterForError = Array.isArray(filter)
            ? filter[0]
            : String(filter || "unknown");
        } catch {
          projectIdForError = "unknown";
          filterForError = "unknown";
        }

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Return a user-friendly error message instead of throwing
        return {
          contents: [
            {
              uri: uri.href,
              text: `# Error Fetching Filtered Logs\n\nAn error occurred while fetching logs with filter "${filterForError}" for project ${projectIdForError}: ${errorMessage}\n\nPlease check your filter syntax and Google Cloud credentials.`,
            },
          ],
        };
      }
    },
  );
}
