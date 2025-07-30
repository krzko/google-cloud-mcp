/**
 * Google Cloud Trace tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId, initGoogleAuth } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import {
  buildTraceHierarchy,
  formatTraceData,
  extractTraceIdFromLog,
} from "./types.js";
import { Logging } from "@google-cloud/logging";
import { logger } from "../../utils/logger.js";
import { stateManager } from "../../utils/state-manager.js";

/**
 * Registers Google Cloud Trace tools with the MCP server
 *
 * @param server The MCP server instance
 */
export async function registerTraceTools(server: McpServer): Promise<void> {
  // Tool to get a trace by ID
  server.tool(
    "gcp-trace-get-trace",
    {
      traceId: z.string().describe("The trace ID to retrieve"),
      projectId: z
        .string()
        .optional()
        .describe("Optional Google Cloud project ID"),
    },
    async ({ traceId, projectId }, context) => {
      try {
        // Use provided project ID or get the default one from state manager first
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

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

        // Fetch the trace from the Cloud Trace API v1
        // API Reference: https://cloud.google.com/trace/docs/reference/v1/rest/v1/projects.traces/get
        const apiUrl = `https://cloudtrace.googleapis.com/v1/projects/${actualProjectId}/traces/${traceId}`;
        logger.debug(`Fetching trace from: ${apiUrl}`);
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
            `Failed to fetch trace: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const traceData = await response.json();

        // Log the raw trace data for debugging
        logger.debug(`Raw trace data: ${JSON.stringify(traceData, null, 2)}`);

        // Debug: Log the exact structure of the trace data
        logger.debug("Trace data structure:");
        logger.debug(`- Type: ${typeof traceData}`);
        logger.debug(`- Keys: ${Object.keys(traceData).join(", ")}`);
        logger.debug(`- Has spans array: ${Array.isArray(traceData.spans)}`);
        logger.debug(`- Spans array length: ${traceData.spans?.length || 0}`);

        // Check if we have valid trace data
        // In v1 API, the response is a Trace object with spans array
        if (!traceData || !traceData.spans || traceData.spans.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No trace found with ID: ${traceId} in project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Log the trace structure for debugging
        logger.debug(
          `Trace structure: projectId=${traceData.projectId}, traceId=${traceData.traceId}, spans count=${traceData.spans.length}`,
        );

        // Log the first span to help with debugging
        if (traceData.spans && traceData.spans.length > 0) {
          const firstSpan = traceData.spans[0];
          logger.debug(
            `First span example: ${JSON.stringify(firstSpan, null, 2)}`,
          );
          logger.debug(
            `First span fields: ${Object.keys(firstSpan).join(", ")}`,
          );

          // Debug: Log specific fields that we're looking for in the span
          logger.debug("Span field details:");
          logger.debug(`- spanId: ${firstSpan.spanId}`);
          logger.debug(`- name: ${firstSpan.name}`);
          logger.debug(`- displayName: ${firstSpan.displayName}`);
          logger.debug(`- startTime: ${firstSpan.startTime}`);
          logger.debug(`- endTime: ${firstSpan.endTime}`);
          logger.debug(`- parentSpanId: ${firstSpan.parentSpanId}`);
          logger.debug(`- kind: ${firstSpan.kind}`);
          logger.debug(`- Has labels: ${!!firstSpan.labels}`);

          if (firstSpan.labels) {
            logger.debug(
              `- Label keys: ${Object.keys(firstSpan.labels).join(", ")}`,
            );
            logger.debug(
              `- HTTP path label: ${firstSpan.labels["/http/path"]}`,
            );
            logger.debug(
              `- HTTP method label: ${firstSpan.labels["/http/method"]}`,
            );
            logger.debug(
              `- Component label: ${firstSpan.labels["/component"]}`,
            );
          }
        }

        // Add additional metadata to the response for better context
        let responseText = `\`\`\`json\n${JSON.stringify(
          {
            traceId: traceId,
            projectId: actualProjectId,
            spanCount: traceData.spans.length,
          },
          null,
          2,
        )}\n\`\`\`\n`;

        // Log the number of spans found
        logger.debug(
          `Found ${traceData.spans.length} spans in trace ${traceId}`,
        );

        try {
          logger.debug("Starting to build trace hierarchy...");

          // Debug: Log each span before processing
          traceData.spans.forEach((span: any, index: number) => {
            logger.debug(`Span ${index} (ID: ${span.spanId}):`);
            logger.debug(`- Name: ${span.name || "undefined"}`);
            logger.debug(`- Parent: ${span.parentSpanId || "None"}`);
            logger.debug(`- Has labels: ${!!span.labels}`);
            if (span.labels) {
              logger.debug(`- Label count: ${Object.keys(span.labels).length}`);
            }
          });

          // Build the trace hierarchy
          const hierarchicalTrace = buildTraceHierarchy(
            actualProjectId.toString(),
            traceId.toString(),
            traceData.spans,
          );

          logger.debug("Trace hierarchy built successfully");
          logger.debug(
            `Root spans count: ${hierarchicalTrace.rootSpans.length}`,
          );

          // Format the trace data for display
          logger.debug("Formatting trace data...");
          const formattedTrace = formatTraceData(hierarchicalTrace);

          // Combine the response text with the formatted trace
          responseText += formattedTrace;

          logger.debug("Trace formatting complete");
        } catch (hierarchyError: any) {
          // If we encounter an error building the hierarchy, log it and provide raw span info
          logger.error(
            `Error building trace hierarchy: ${hierarchyError.message}`,
          );

          // Provide a simplified trace summary
          responseText += "## Error Building Trace Hierarchy\n\n";
          responseText += `Error: ${hierarchyError.message}\n\n`;
          responseText += "## Raw Span Summary\n\n";

          // List spans with basic information
          for (const span of traceData.spans) {
            const spanId = span.spanId || "Unknown";
            const name = span.name || "Unknown";
            const parentId = span.parentSpanId || "None";

            responseText += `- **Span ID**: ${spanId}\n`;
            responseText += `  - Name: ${name}\n`;
            responseText += `  - Parent: ${parentId}\n`;

            // Add timing if available
            if (span.startTime && span.endTime) {
              const startDate = new Date(span.startTime);
              const endDate = new Date(span.endTime);
              const durationMs = endDate.getTime() - startDate.getTime();
              responseText += `  - Duration: ${durationMs}ms\n`;
            }

            // Add a few important labels if available
            if (span.labels) {
              responseText += `  - Labels: ${Object.keys(span.labels).length} total\n`;
              const importantLabels = [
                "/http/method",
                "/http/path",
                "/http/status_code",
                "/component",
                "g.co/agent",
              ];
              for (const key of importantLabels) {
                if (span.labels[key]) {
                  responseText += `    - ${key}: ${span.labels[key]}\n`;
                }
              }
            }

            responseText += "\n";
          }
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        // Error handling for get-trace tool
        throw new GcpMcpError(
          `Failed to fetch trace: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );

  // Tool to list recent traces
  server.tool(
    "gcp-trace-list-traces",
    {
      projectId: z
        .string()
        .optional()
        .describe("Optional Google Cloud project ID"),
      filter: z
        .string()
        .optional()
        .describe(
          'Optional filter for traces (e.g., "status.code != 0" for errors)',
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe("Maximum number of traces to return"),
      startTime: z
        .string()
        .optional()
        .describe(
          'Start time in RFC3339 format (e.g., "2023-01-01T00:00:00Z") or relative time (e.g., "1h", "2d")',
        ),
    },
    async ({ projectId, filter, limit, startTime }, context) => {
      try {
        // Use provided project ID or get the default one from state manager first
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        // Calculate time range
        const endTime = new Date();
        let startTimeDate: Date;

        if (startTime) {
          logger.debug(`Raw startTime parameter: ${JSON.stringify(startTime)}`);

          // Handle the case where startTime might be passed as an object from JSON
          const startTimeStr =
            typeof startTime === "string" ? startTime : String(startTime);
          logger.debug(`Processing startTime: ${startTimeStr}`);

          // Check if the input is a relative time format (e.g., "1h", "2d", "30m")
          if (startTimeStr.match(/^\d+[hmd]$/)) {
            // Parse relative time (e.g., "1h", "2d")
            const value = parseInt(startTimeStr.slice(0, -1));
            const unit = startTimeStr.slice(-1);

            startTimeDate = new Date(endTime);
            if (unit === "h") {
              startTimeDate.setHours(startTimeDate.getHours() - value);
            } else if (unit === "d") {
              startTimeDate.setDate(startTimeDate.getDate() - value);
            } else if (unit === "m") {
              startTimeDate.setMinutes(startTimeDate.getMinutes() - value);
            }
            logger.debug(
              `Parsed relative time: ${startTimeStr} to ${startTimeDate.toISOString()}`,
            );
          } else {
            // Parse ISO format
            try {
              startTimeDate = new Date(startTimeStr);
              if (isNaN(startTimeDate.getTime())) {
                throw new Error("Invalid date format");
              }
              logger.debug(
                `Parsed ISO time: ${startTimeStr} to ${startTimeDate.toISOString()}`,
              );
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logger.error(`Error parsing time: ${errorMessage}`);
              throw new GcpMcpError(
                `Invalid start time format: "${startTimeStr}". Use ISO format or relative time (e.g., "1h", "2d").`,
                "INVALID_ARGUMENT",
                400,
              );
            }
          }
        } else {
          // Default to 1 hour ago
          startTimeDate = new Date(endTime);
          startTimeDate.setHours(startTimeDate.getHours() - 1);
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

        // Format timestamps in RFC3339 UTC "Zulu" format as required by the API
        // Example format: "2014-10-02T15:01:23Z"
        // The Cloud Trace API requires RFC3339 format timestamps
        const startTimeUTC = startTimeDate.toISOString();
        const endTimeUTC = endTime.toISOString();

        logger.debug(
          `Using formatted timestamps: startTime=${startTimeUTC}, endTime=${endTimeUTC}`,
        );

        // Build the query parameters for the request according to the API documentation
        const queryParams = new URLSearchParams();

        // Required parameters - format must be RFC3339 UTC "Zulu" format
        // The Cloud Trace API requires timestamps in RFC3339 format
        // Example: "2014-10-02T15:01:23Z"
        queryParams.append("startTime", startTimeUTC); // Start of the time interval (inclusive)
        queryParams.append("endTime", endTimeUTC); // End of the time interval (inclusive)

        // Optional parameters
        queryParams.append("pageSize", limit.toString()); // Maximum number of traces to return

        // The view parameter is optional and defaults to MINIMAL
        // ROOTSPAN includes the root span with the trace
        // COMPLETE includes all spans with the trace
        queryParams.append("view", "COMPLETE"); // Type of data returned (MINIMAL, ROOTSPAN, COMPLETE)

        // Add orderBy parameter to sort by most recent traces first
        queryParams.append("orderBy", "start desc"); // Sort by start time descending

        // Optional filter parameter
        if (filter) {
          queryParams.append("filter", filter); // Filter against labels for the request
        }

        // Construct the URL for the Cloud Trace API v1 endpoint
        // The correct endpoint format according to the documentation is:
        // GET https://cloudtrace.googleapis.com/v1/projects/{projectId}/traces
        const apiUrl = `https://cloudtrace.googleapis.com/v1/projects/${actualProjectId}/traces`;
        const requestUrl = `${apiUrl}?${queryParams.toString()}`;

        logger.debug(`List Traces URL: ${requestUrl}`);
        logger.debug(
          `List Traces Query Params: ${JSON.stringify(Object.fromEntries(queryParams.entries()))}`,
        );
        logger.debug(
          `List Traces Time Range: ${startTimeDate.toISOString()} to ${endTime.toISOString()}`,
        );
        logger.debug(`List Traces Raw Query String: ${queryParams.toString()}`);

        // Fetch traces from the Cloud Trace API
        logger.debug(`Sending request to Cloud Trace API: ${requestUrl}`);
        let tracesData;

        try {
          const response = await fetch(requestUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token.token}`,
              Accept: "application/json",
            },
          });

          logger.debug(`List Traces Response Status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            logger.error(`List Traces Error: ${errorText}`);
            throw new GcpMcpError(
              `Failed to list traces: ${errorText}`,
              "FAILED_PRECONDITION",
              response.status,
            );
          }

          // Log the full response headers to help debug
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          logger.debug(
            `List Traces Response Headers: ${JSON.stringify(responseHeaders)}`,
          );

          tracesData = await response.json();
          logger.debug(
            `List Traces Response Data: ${JSON.stringify(tracesData, null, 2)}`,
          );
        } catch (fetchError: any) {
          logger.error(`Fetch error: ${fetchError.message}`);
          throw new GcpMcpError(
            `Failed to fetch traces: ${fetchError.message}`,
            "INTERNAL",
            500,
          );
        }

        // Check if we have valid traces data
        // In v1 API, the response contains a traces array
        if (!tracesData.traces || tracesData.traces.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No traces found matching the criteria in project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Use the helper function to format the response
        return formatTracesResponse(
          tracesData,
          actualProjectId,
          startTimeDate,
          endTime,
          filter,
        );
      } catch (error: any) {
        // Error handling for list-traces tool
        throw new GcpMcpError(
          `Failed to list traces: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );

  // Tool to find traces associated with logs
  server.tool(
    "gcp-trace-find-from-logs",
    {
      projectId: z
        .string()
        .optional()
        .describe("Optional Google Cloud project ID"),
      filter: z
        .string()
        .describe(
          'Filter for logs (e.g., "severity>=ERROR AND timestamp>\"-1d\"")',
        ),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe("Maximum number of logs to check"),
    },
    async ({ projectId, filter, limit }, context) => {
      try {
        // Use provided project ID or get the default one from state manager first
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        // Process the filter to handle relative time formats
        let processedFilter = filter;

        // Check for relative time patterns in the filter
        const relativeTimeRegex = /(timestamp[><]=?\s*["'])(-?\d+[hmd])(["'])/g;
        processedFilter = processedFilter.replace(
          relativeTimeRegex,
          (
            match: string,
            prefix: string,
            timeValue: string,
            suffix: string,
          ) => {
            logger.debug(
              `Found relative time in filter: ${match}, timeValue: ${timeValue}`,
            );

            // Parse the relative time
            const value = parseInt(timeValue.slice(1, -1));
            const unit = timeValue.slice(-1);
            const isNegative = timeValue.startsWith("-");

            // Calculate the absolute time
            const now = new Date();
            const targetDate = new Date(now);

            if (unit === "h") {
              targetDate.setHours(
                targetDate.getHours() + (isNegative ? -value : value),
              );
            } else if (unit === "d") {
              targetDate.setDate(
                targetDate.getDate() + (isNegative ? -value : value),
              );
            } else if (unit === "m") {
              targetDate.setMinutes(
                targetDate.getMinutes() + (isNegative ? -value : value),
              );
            }

            // Format as RFC3339
            const formattedTime = targetDate.toISOString();
            logger.debug(
              `Converted relative time ${timeValue} to absolute time: ${formattedTime}`,
            );

            // Return the updated filter part
            return `${prefix}${formattedTime}${suffix}`;
          },
        );

        logger.debug(`Original filter: ${filter}`);
        logger.debug(`Processed filter: ${processedFilter}`);

        // Initialize the logging client
        const logging = new Logging({
          projectId: actualProjectId,
        });

        // Fetch logs with the processed filter
        const [entries] = await logging.getEntries({
          filter: processedFilter,
          pageSize: limit,
        });

        if (!entries || entries.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No logs found matching the filter: "${filter}" in project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Extract trace IDs from logs
        const traceMap = new Map<
          string,
          {
            traceId: string;
            timestamp: string;
            severity: string;
            logName: string;
            message: string;
          }
        >();

        for (const entry of entries) {
          const metadata = entry.metadata;
          const traceId = extractTraceIdFromLog(metadata);

          if (traceId) {
            // Convert timestamp to string
            let timestampStr = "Unknown";
            if (metadata.timestamp) {
              if (typeof metadata.timestamp === "string") {
                timestampStr = metadata.timestamp;
              } else {
                try {
                  // Handle different timestamp formats
                  if (
                    typeof metadata.timestamp === "object" &&
                    metadata.timestamp !== null
                  ) {
                    if (
                      "seconds" in metadata.timestamp &&
                      "nanos" in metadata.timestamp
                    ) {
                      // Handle Timestamp proto format
                      const seconds = Number(metadata.timestamp.seconds);
                      const nanos = Number(metadata.timestamp.nanos || 0);
                      const milliseconds = seconds * 1000 + nanos / 1000000;
                      timestampStr = new Date(milliseconds).toISOString();
                    } else {
                      // Try to convert using JSON
                      timestampStr = JSON.stringify(metadata.timestamp);
                    }
                  } else {
                    timestampStr = String(metadata.timestamp);
                  }
                } catch (e) {
                  timestampStr = "Invalid timestamp";
                }
              }
            }

            // Convert severity to string
            let severityStr = "DEFAULT";
            if (metadata.severity) {
              severityStr = String(metadata.severity);
            }

            // Convert logName to string
            let logNameStr = "Unknown";
            if (metadata.logName) {
              logNameStr = String(metadata.logName);
            }

            // Extract message
            let messageStr = "No message";
            if (metadata.textPayload) {
              messageStr = String(metadata.textPayload);
            } else if (metadata.jsonPayload) {
              try {
                messageStr = JSON.stringify(metadata.jsonPayload);
              } catch (e) {
                messageStr = "Invalid JSON payload";
              }
            }

            traceMap.set(traceId, {
              traceId,
              timestamp: timestampStr,
              severity: severityStr,
              logName: logNameStr,
              message: messageStr,
            });
          }
        }

        if (traceMap.size === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No traces found in the logs matching the filter: "${filter}" in project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Format the traces for display
        let markdown = `# Traces Found in Logs\n\n`;
        markdown += `Project: ${actualProjectId}\n`;
        markdown += `Log Filter: ${filter}\n`;
        markdown += `Found ${traceMap.size} unique traces in ${entries.length} log entries:\n\n`;

        // Table header
        markdown +=
          "| Trace ID | Timestamp | Severity | Log Name | Message |\n";
        markdown += "|----------|-----------|----------|----------|--------|\n";

        // Table rows
        for (const trace of traceMap.values()) {
          const traceId = trace.traceId;
          // Handle timestamp formatting safely
          let timestamp = trace.timestamp;
          try {
            if (timestamp !== "Unknown" && timestamp !== "Invalid timestamp") {
              timestamp = new Date(trace.timestamp).toISOString();
            }
          } catch (e) {
            // Keep the original timestamp if conversion fails
          }
          const severity = trace.severity;
          const logName = trace.logName.split("/").pop() || trace.logName;
          const message =
            trace.message.length > 100
              ? trace.message.substring(0, 100) + "..."
              : trace.message;

          markdown += `| \`${traceId}\` | ${timestamp} | ${severity} | ${logName} | ${message} |\n`;
        }

        markdown +=
          "\n\nTo view a specific trace, use the `get-trace` tool with the trace ID.";

        return {
          content: [
            {
              type: "text",
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        // Error handling for find-traces-from-logs tool
        throw new GcpMcpError(
          `Failed to find traces from logs: ${error.message}`,
          error.code || "UNKNOWN",
          error.statusCode || 500,
        );
      }
    },
  );

  // Tool to analyze a trace using natural language
  server.tool(
    "gcp-trace-query-natural-language",
    {
      query: z
        .string()
        .describe(
          'Natural language query about traces (e.g., "Show me failed traces from the last hour")',
        ),
      projectId: z
        .string()
        .optional()
        .describe("Optional Google Cloud project ID"),
    },
    async ({ query, projectId }, context) => {
      try {
        // Use provided project ID or get the default one from state manager first
        const actualProjectId =
          projectId ||
          stateManager.getCurrentProjectId() ||
          (await getProjectId());

        // Process the natural language query
        const normalizedQuery = query.toLowerCase();

        // Default parameters
        let filter = "";
        let limit = 10;
        let startTime = "1h"; // Default to 1 hour
        let traceId = "";

        // Extract trace ID if present
        const traceIdMatch = normalizedQuery.match(
          /trace(?:\s+id)?[:\s]+([a-f0-9]+)/i,
        );
        if (traceIdMatch && traceIdMatch[1]) {
          traceId = traceIdMatch[1];

          // If we have a trace ID, implement the get-trace functionality directly
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
              headers: {
                Authorization: `Bearer ${token.token}`,
                "Content-Type": "application/json",
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
              content: [
                {
                  type: "text",
                  text: `No trace found with ID: ${traceId} in project: ${actualProjectId}`,
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
            content: [
              {
                type: "text",
                text: formattedTrace,
              },
            ],
          };
        }

        // Extract time range
        if (
          normalizedQuery.includes("last hour") ||
          normalizedQuery.includes("past hour")
        ) {
          startTime = "1h";
        } else if (
          normalizedQuery.includes("last day") ||
          normalizedQuery.includes("past day") ||
          normalizedQuery.includes("24 hours") ||
          normalizedQuery.includes("today")
        ) {
          startTime = "24h";
        } else if (
          normalizedQuery.includes("last week") ||
          normalizedQuery.includes("past week")
        ) {
          startTime = "7d";
        } else if (
          normalizedQuery.includes("last month") ||
          normalizedQuery.includes("past month")
        ) {
          startTime = "30d";
        }

        // Extract status filter
        if (
          normalizedQuery.includes("fail") ||
          normalizedQuery.includes("error") ||
          normalizedQuery.includes("exception") ||
          normalizedQuery.includes("problem")
        ) {
          filter = "status.code != 0"; // Non-zero status codes indicate errors
        }

        // Extract limit
        const limitMatch = normalizedQuery.match(
          /\b(show|display|list|get|find)?\s+(\d+)\s+(trace|span|result)/i,
        );
        if (limitMatch && limitMatch[2]) {
          limit = parseInt(limitMatch[2]);
          limit = Math.min(Math.max(limit, 1), 100); // Clamp between 1 and 100
        }

        // If query mentions logs, use the find-traces-from-logs tool
        if (
          normalizedQuery.includes("log") ||
          normalizedQuery.includes("logging")
        ) {
          let logFilter = "severity>=ERROR"; // Default to error logs

          if (
            normalizedQuery.includes("info") ||
            normalizedQuery.includes("information")
          ) {
            logFilter = "severity>=INFO";
          } else if (
            normalizedQuery.includes("warn") ||
            normalizedQuery.includes("warning")
          ) {
            logFilter = "severity>=WARNING";
          } else if (normalizedQuery.includes("debug")) {
            logFilter = "severity>=DEBUG";
          }

          // Implement find-traces-from-logs functionality directly
          // Initialize the logging client
          const logging = new Logging({
            projectId: actualProjectId,
          });

          // Fetch logs with the given filter
          const [entries] = await logging.getEntries({
            filter: logFilter,
            pageSize: limit,
          });

          if (!entries || entries.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No logs found matching the filter: "${logFilter}" in project: ${actualProjectId}`,
                },
              ],
            };
          }

          // Extract trace IDs from logs
          const traceMap = new Map<
            string,
            {
              traceId: string;
              timestamp: string;
              severity: string;
              logName: string;
              message: string;
            }
          >();

          for (const entry of entries) {
            const metadata = entry.metadata;
            const traceId = extractTraceIdFromLog(metadata);

            if (traceId) {
              // Convert timestamp to string
              let timestampStr = "Unknown";
              if (metadata.timestamp) {
                if (typeof metadata.timestamp === "string") {
                  timestampStr = metadata.timestamp;
                } else {
                  try {
                    // Handle different timestamp formats
                    if (
                      typeof metadata.timestamp === "object" &&
                      metadata.timestamp !== null
                    ) {
                      if (
                        "seconds" in metadata.timestamp &&
                        "nanos" in metadata.timestamp
                      ) {
                        // Handle Timestamp proto format
                        const seconds = Number(metadata.timestamp.seconds);
                        const nanos = Number(metadata.timestamp.nanos || 0);
                        const milliseconds = seconds * 1000 + nanos / 1000000;
                        timestampStr = new Date(milliseconds).toISOString();
                      } else {
                        // Try to convert using JSON
                        timestampStr = JSON.stringify(metadata.timestamp);
                      }
                    } else {
                      timestampStr = String(metadata.timestamp);
                    }
                  } catch (e) {
                    timestampStr = "Invalid timestamp";
                  }
                }
              }

              // Convert severity to string
              let severityStr = "DEFAULT";
              if (metadata.severity) {
                severityStr = String(metadata.severity);
              }

              // Convert logName to string
              let logNameStr = "Unknown";
              if (metadata.logName) {
                logNameStr = String(metadata.logName);
              }

              // Extract message
              let messageStr = "No message";
              if (metadata.textPayload) {
                messageStr = String(metadata.textPayload);
              } else if (metadata.jsonPayload) {
                try {
                  messageStr = JSON.stringify(metadata.jsonPayload);
                } catch (e) {
                  messageStr = "Invalid JSON payload";
                }
              }

              traceMap.set(traceId, {
                traceId,
                timestamp: timestampStr,
                severity: severityStr,
                logName: logNameStr,
                message: messageStr,
              });
            }
          }

          if (traceMap.size === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No traces found in the logs matching the filter: "${logFilter}" in project: ${actualProjectId}`,
                },
              ],
            };
          }

          // Format the traces for display
          let markdown = `# Traces Found in Logs\n\n`;
          markdown += `Project: ${actualProjectId}\n`;
          markdown += `Log Filter: ${logFilter}\n`;
          markdown += `Found ${traceMap.size} unique traces in ${entries.length} log entries:\n\n`;

          // Table header
          markdown +=
            "| Trace ID | Timestamp | Severity | Log Name | Message |\n";
          markdown +=
            "|----------|-----------|----------|----------|--------|\n";

          // Table rows
          for (const trace of traceMap.values()) {
            const traceId = trace.traceId;
            // Handle timestamp formatting safely
            let timestamp = trace.timestamp;
            try {
              if (
                timestamp !== "Unknown" &&
                timestamp !== "Invalid timestamp"
              ) {
                timestamp = new Date(trace.timestamp).toISOString();
              }
            } catch (e) {
              // Keep the original timestamp if conversion fails
            }
            const severity = trace.severity;
            const logName = trace.logName.split("/").pop() || trace.logName;
            const message =
              trace.message.length > 100
                ? `${trace.message.substring(0, 100)}...`
                : trace.message;

            markdown += `| ${traceId} | ${timestamp} | ${severity} | ${logName} | ${message} |\n`;
          }

          return {
            content: [
              {
                type: "text",
                text: markdown,
              },
            ],
          };
        }

        // Otherwise, use the list-traces tool
        // Implement list-traces functionality directly
        // Calculate time range
        const endTime = new Date();
        let startTimeDate: Date;

        if (startTime) {
          logger.debug(`Raw startTime parameter: ${JSON.stringify(startTime)}`);

          // Handle the case where startTime might be passed as an object from JSON
          const startTimeStr =
            typeof startTime === "string" ? startTime : String(startTime);
          logger.debug(`Processing startTime: ${startTimeStr}`);

          // Check if the input is a relative time format (e.g., "1h", "2d", "30m")
          if (startTimeStr.match(/^\d+[hmd]$/)) {
            // Parse relative time (e.g., "1h", "2d")
            const value = parseInt(startTimeStr.slice(0, -1));
            const unit = startTimeStr.slice(-1);

            startTimeDate = new Date(endTime);
            if (unit === "h") {
              startTimeDate.setHours(startTimeDate.getHours() - value);
            } else if (unit === "d") {
              startTimeDate.setDate(startTimeDate.getDate() - value);
            } else if (unit === "m") {
              startTimeDate.setMinutes(startTimeDate.getMinutes() - value);
            }
            logger.debug(
              `Parsed relative time: ${startTimeStr} to ${startTimeDate.toISOString()}`,
            );
          } else {
            // Parse ISO format
            try {
              startTimeDate = new Date(startTimeStr);
              if (isNaN(startTimeDate.getTime())) {
                throw new Error("Invalid date format");
              }
              logger.debug(
                `Parsed ISO time: ${startTimeStr} to ${startTimeDate.toISOString()}`,
              );
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logger.error(`Error parsing time: ${errorMessage}`);
              throw new GcpMcpError(
                `Invalid start time format: "${startTimeStr}". Use ISO format or relative time (e.g., "1h", "2d").`,
                "INVALID_ARGUMENT",
                400,
              );
            }
          }
        } else {
          // Default to 1 hour ago
          startTimeDate = new Date(endTime);
          startTimeDate.setHours(startTimeDate.getHours() - 1);
        }

        // Build the request body
        const requestBody: any = {
          projectId: actualProjectId,
          startTime: startTimeDate.toISOString(),
          endTime: endTime.toISOString(),
          pageSize: limit,
        };

        if (filter) {
          requestBody.filter = filter;
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

        // Build the query parameters for the request
        const queryParams = new URLSearchParams();

        // Format timestamps in RFC3339 UTC "Zulu" format
        const startTimeUTC = new Date(
          startTimeDate.toISOString(),
        ).toISOString();
        const endTimeUTC = new Date(endTime.toISOString()).toISOString();

        // Add required query parameters according to the API documentation
        queryParams.append("startTime", startTimeUTC);
        queryParams.append("endTime", endTimeUTC);
        queryParams.append("pageSize", limit.toString());
        // Add view parameter to specify the type of data returned
        queryParams.append("view", "MINIMAL");
        if (filter) {
          queryParams.append("filter", filter);
        }

        // Construct the URL for the Cloud Trace API v1 endpoint
        const apiUrl = `https://cloudtrace.googleapis.com/v1/projects/${actualProjectId}/traces`;
        const requestUrl = `${apiUrl}?${queryParams.toString()}`;

        logger.debug(`Fetching traces from: ${requestUrl}`);

        // Fetch traces from the Cloud Trace API
        const response = await fetch(requestUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token.token}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new GcpMcpError(
            `Failed to list traces: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const tracesData = await response.json();

        // Check if we have valid traces data
        // In v1 API, the response contains a traces array
        if (!tracesData.traces || tracesData.traces.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No traces found matching the criteria in project: ${actualProjectId}`,
              },
            ],
          };
        }

        // Format the traces for display
        let markdown = `# Traces for ${actualProjectId}\n\n`;
        markdown += `Time Range: ${startTimeDate.toISOString()} to ${endTime.toISOString()}\n`;
        markdown += `Filter: ${filter || "None"}\n\n`;
        markdown += `Found ${tracesData.traces.length} traces:\n\n`;

        // Table header
        markdown +=
          "| Trace ID | Display Name | Start Time | Duration | Status |\n";
        markdown +=
          "|----------|--------------|------------|----------|--------|\n";

        // Table rows
        for (const trace of tracesData.traces) {
          const traceId = trace.traceId;
          const displayName = trace.displayName || "Unknown";
          const startTimeStr = new Date(trace.startTime).toISOString();
          const duration = calculateDuration(trace.startTime, trace.endTime);
          const status =
            trace.status?.code === 0
              ? "OK"
              : `Error: ${trace.status?.message || "Unknown error"}`;

          markdown += `| ${traceId} | ${displayName} | ${startTimeStr} | ${duration} | ${status} |\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: markdown,
            },
          ],
        };
      } catch (error: any) {
        // Error handling for natural-language-trace-query tool
        throw new GcpMcpError(
          `Failed to process natural language query: ${error.message}`,
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

/**
 * Formats the traces response for display
 *
 * @param tracesData The traces data from the API
 * @param projectId The Google Cloud project ID
 * @param startTime The start time of the query
 * @param endTime The end time of the query
 * @param filter The filter used in the query
 * @returns Formatted response
 */
function formatTracesResponse(
  tracesData: any,
  projectId: string,
  startTime: Date,
  endTime: Date,
  filter?: string,
): any {
  // Format the traces for display
  let markdown = `# Traces for ${projectId}\n\n`;
  markdown += `Time Range: ${startTime.toISOString()} to ${endTime.toISOString()}\n`;
  markdown += `Filter: ${filter || "None"}\n\n`;
  markdown += `Found ${tracesData.traces.length} traces:\n\n`;

  // Table header
  markdown += "| Trace ID | Display Name | Start Time | Duration | Status |\n";
  markdown += "|----------|--------------|------------|----------|--------|\n";

  // Table rows
  for (const trace of tracesData.traces) {
    const traceId = trace.traceId;
    const displayName = trace.displayName || "Unknown";
    const startTimeStr = new Date(trace.startTime).toISOString();
    const duration = calculateDuration(trace.startTime, trace.endTime);
    const status =
      trace.status?.code === 0
        ? "✅ OK"
        : trace.status?.code > 0
          ? "❌ ERROR"
          : "⚪ UNKNOWN";

    markdown += `| \`${traceId}\` | ${displayName} | ${startTimeStr} | ${duration} | ${status} |\n`;
  }

  markdown +=
    "\n\nTo view a specific trace, use the `get-trace` tool with the trace ID.";

  return {
    content: [
      {
        type: "text",
        text: markdown,
      },
    ],
  };
}
