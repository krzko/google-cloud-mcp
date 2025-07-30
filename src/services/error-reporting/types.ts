/**
 * Type definitions for Google Cloud Error Reporting service
 */
import { initGoogleAuth } from "../../utils/auth.js";

/**
 * Interface for Google Cloud Error Group (matches REST API schema)
 */
export interface ErrorGroup {
  name: string;
  groupId: string;
  trackingIssues?: Array<{
    url: string;
  }>;
  resolutionStatus?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "MUTED";
}

/**
 * Interface for Google Cloud Error Event (matches REST API schema)
 */
export interface ErrorEvent {
  eventTime?: string;
  serviceContext?: ServiceContext;
  message?: string;
  context?: ErrorContext;
}

/**
 * Interface for Service Context (matches REST API schema)
 */
export interface ServiceContext {
  service: string;
  version?: string;
  resourceType?: string;
}

/**
 * Interface for Error Context (matches REST API schema)
 */
export interface ErrorContext {
  httpRequest?: {
    method?: string;
    url?: string;
    userAgent?: string;
    referrer?: string;
    responseStatusCode?: number;
    remoteIp?: string;
  };
  user?: string;
  reportLocation?: {
    filePath?: string;
    lineNumber?: number;
    functionName?: string;
  };
  sourceReferences?: Array<{
    repository?: string;
    revisionId?: string;
  }>;
}

/**
 * Interface for Timed Count (matches REST API schema)
 */
export interface TimedCount {
  count: string;
  startTime: string;
  endTime: string;
}

/**
 * Interface for Error Group Stats (matches REST API schema)
 */
export interface ErrorGroupStats {
  group?: ErrorGroup;
  count: string;
  affectedUsersCount: string;
  timedCounts?: TimedCount[];
  firstSeenTime: string;
  lastSeenTime: string;
  affectedServices?: ServiceContext[];
  numAffectedServices?: number;
  representative?: ErrorEvent;
}

/**
 * Interface for List Group Stats Response (matches REST API schema)
 */
export interface ListGroupStatsResponse {
  errorGroupStats: ErrorGroupStats[];
  nextPageToken?: string;
  timeRangeBegin?: string;
}

/**
 * Gets the Google Cloud Error Reporting client
 *
 * @returns The Error Reporting client
 */
/**
 * Gets an authenticated client for Google Cloud Error Reporting API
 *
 * @returns Promise resolving to { auth, token } for making API calls
 */
export async function getErrorReportingAuth() {
  const auth = await initGoogleAuth(true);
  if (!auth) {
    throw new Error("Google Cloud authentication not available");
  }
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return { auth, token: token.token };
}

/**
 * Formats an error group summary as markdown
 *
 * @param errorGroup The error group summary to format
 * @returns A markdown string representation of the error
 */
export function formatErrorGroupSummary(errorGroup: ErrorGroupStats): string {
  const {
    group,
    count,
    affectedUsersCount,
    firstSeenTime,
    lastSeenTime,
    representative,
  } = errorGroup;

  let markdown = `## Error Group: ${group?.groupId || "Unknown"}\n\n`;

  // Error summary
  markdown += `**Message:** ${representative?.message || "No message"}\n\n`;
  markdown += `**Service:** ${representative?.serviceContext?.service || "Unknown"}`;
  if (representative?.serviceContext?.version) {
    markdown += ` (v${representative.serviceContext.version})`;
  }
  markdown += `\n\n`;

  // Statistics
  markdown += `**Statistics:**\n`;
  markdown += `- Total occurrences: ${count}\n`;
  markdown += `- Affected users: ${affectedUsersCount}\n`;
  markdown += `- First seen: ${new Date(firstSeenTime).toLocaleString()}\n`;
  markdown += `- Last seen: ${new Date(lastSeenTime).toLocaleString()}\n\n`;

  // Error context
  if (representative?.context) {
    if (representative.context?.httpRequest) {
      const req = representative.context.httpRequest;
      markdown += `**HTTP Request Context:**\n`;
      if (req.method && req.url) {
        markdown += `- ${req.method} ${req.url}\n`;
      }
      if (req.responseStatusCode) {
        markdown += `- Response status: ${req.responseStatusCode}\n`;
      }
      if (req.userAgent) {
        markdown += `- User agent: ${req.userAgent}\n`;
      }
      markdown += `\n`;
    }

    if (representative.context?.reportLocation) {
      const loc = representative.context.reportLocation;
      markdown += `**Source Location:**\n`;
      if (loc.filePath) {
        markdown += `- File: ${loc.filePath}`;
        if (loc.lineNumber) {
          markdown += `:${loc.lineNumber}`;
        }
        markdown += `\n`;
      }
      if (loc.functionName) {
        markdown += `- Function: ${loc.functionName}\n`;
      }
      markdown += `\n`;
    }
  }

  // Resolution status
  if (group?.resolutionStatus) {
    markdown += `**Resolution Status:** ${group.resolutionStatus}\n\n`;
  }

  // Tracking issues
  if (group?.trackingIssues && group.trackingIssues.length > 0) {
    markdown += `**Tracking Issues:**\n`;
    group.trackingIssues.forEach((issue) => {
      markdown += `- ${issue.url}\n`;
    });
    markdown += `\n`;
  }

  return markdown;
}

/**
 * Analyses error patterns and suggests remediation
 *
 * @param errorGroups Array of error group summaries
 * @returns Analysis and remediation suggestions
 */
export function analyseErrorPatternsAndSuggestRemediation(
  errorGroups: ErrorGroupStats[],
): string {
  if (errorGroups.length === 0) {
    return "No errors found in the specified time range.";
  }

  let analysis = `# Error Analysis and Remediation Suggestions\n\n`;
  analysis += `**Total Error Groups:** ${errorGroups.length}\n\n`;

  // Calculate total errors and affected users
  const totalErrors = errorGroups.reduce(
    (sum, group) => sum + parseInt(group.count),
    0,
  );
  const totalAffectedUsers = errorGroups.reduce(
    (sum, group) => sum + parseInt(group.affectedUsersCount),
    0,
  );

  analysis += `**Summary:**\n`;
  analysis += `- Total errors: ${totalErrors.toLocaleString()}\n`;
  analysis += `- Total affected users: ${totalAffectedUsers.toLocaleString()}\n`;
  analysis += `- Error groups: ${errorGroups.length}\n\n`;

  // Sort by error count (most frequent first)
  const sortedErrors = [...errorGroups].sort(
    (a, b) => parseInt(b.count) - parseInt(a.count),
  );

  analysis += `## Top Error Groups by Frequency\n\n`;

  // Analyse top 5 errors
  sortedErrors.slice(0, 5).forEach((errorGroup, index) => {
    analysis += `### ${index + 1}. ${errorGroup.representative?.serviceContext?.service || "Unknown Service"}\n\n`;
    analysis += `**Error:** ${errorGroup.representative?.message || "No message"}\n\n`;
    analysis += `**Impact:** ${errorGroup.count} occurrences, ${errorGroup.affectedUsersCount} affected users\n\n`;

    // Suggest remediation based on error patterns
    const remediation = suggestRemediation(errorGroup);
    if (remediation) {
      analysis += `**Suggested Remediation:**\n${remediation}\n\n`;
    }

    analysis += `---\n\n`;
  });

  // Pattern analysis
  analysis += `## Pattern Analysis\n\n`;

  // Group by service
  const serviceGroups = new Map<string, ErrorGroupStats[]>();
  errorGroups.forEach((group) => {
    const service = group.representative?.serviceContext?.service || "Unknown";
    if (!serviceGroups.has(service)) {
      serviceGroups.set(service, []);
    }
    serviceGroups.get(service)!.push(group);
  });

  if (serviceGroups.size > 1) {
    analysis += `**Services Affected:** ${serviceGroups.size}\n`;
    serviceGroups.forEach((groups, service) => {
      const serviceErrors = groups.reduce(
        (sum, group) => sum + parseInt(group.count),
        0,
      );
      analysis += `- ${service}: ${groups.length} error groups, ${serviceErrors} total errors\n`;
    });
    analysis += `\n`;
  }

  // Time-based analysis
  const recentErrors = errorGroups.filter((group) => {
    const lastSeen = new Date(group.lastSeenTime);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return lastSeen > oneHourAgo;
  });

  if (recentErrors.length > 0) {
    analysis += `**Recent Activity:** ${recentErrors.length} error groups with activity in the last hour\n\n`;
  }

  return analysis;
}

/**
 * Suggests remediation for a specific error group
 *
 * @param errorGroup The error group to analyse
 * @returns Remediation suggestions
 */
function suggestRemediation(errorGroup: ErrorGroupStats): string {
  const message = (errorGroup.representative?.message || "").toLowerCase();
  const httpStatus =
    errorGroup.representative?.context?.httpRequest?.responseStatusCode;

  const suggestions: string[] = [];

  // HTTP status code based suggestions
  if (httpStatus) {
    if (httpStatus >= 500 && httpStatus < 600) {
      suggestions.push(
        "• **Server Error (5xx):** Check application logs for internal errors, database connectivity, and resource availability",
      );
      suggestions.push(
        "• Monitor application health metrics and consider scaling if under high load",
      );
    } else if (httpStatus >= 400 && httpStatus < 500) {
      suggestions.push(
        "• **Client Error (4xx):** Review API documentation and input validation",
      );
      if (httpStatus === 404) {
        suggestions.push(
          "• **404 Not Found:** Verify routing configuration and resource existence",
        );
      } else if (httpStatus === 401 || httpStatus === 403) {
        suggestions.push(
          "• **Authentication/Authorisation:** Check API keys, tokens, and permission configurations",
        );
      }
    }
  }

  // Message-based suggestions
  if (message.includes("timeout") || message.includes("deadline")) {
    suggestions.push(
      "• **Timeout Issues:** Increase timeout values, optimise query performance, or implement retry logic",
    );
    suggestions.push(
      "• Consider using asynchronous processing for long-running operations",
    );
  }

  if (message.includes("memory") || message.includes("oom")) {
    suggestions.push(
      "• **Memory Issues:** Increase memory allocation, optimise memory usage, or implement memory profiling",
    );
    suggestions.push(
      "• Review for memory leaks and consider garbage collection tuning",
    );
  }

  if (message.includes("database") || message.includes("sql")) {
    suggestions.push(
      "• **Database Issues:** Check database connectivity, query performance, and connection pool settings",
    );
    suggestions.push(
      "• Monitor database metrics and consider query optimisation",
    );
  }

  if (message.includes("permission") || message.includes("access denied")) {
    suggestions.push(
      "• **Permission Issues:** Verify IAM roles, service account permissions, and resource access policies",
    );
    suggestions.push(
      "• Check Google Cloud IAM configuration for the affected service",
    );
  }

  if (message.includes("rate limit") || message.includes("quota")) {
    suggestions.push(
      "• **Rate Limiting:** Review API quotas, implement exponential backoff, and consider request batching",
    );
    suggestions.push(
      "• Monitor usage patterns and request quota increases if needed",
    );
  }

  if (message.includes("connection") || message.includes("network")) {
    suggestions.push(
      "• **Network Issues:** Check network connectivity, firewall rules, and DNS resolution",
    );
    suggestions.push(
      "• Consider implementing circuit breaker pattern for external dependencies",
    );
  }

  // Generic suggestions if no specific patterns found
  if (suggestions.length === 0) {
    suggestions.push(
      "• **General:** Enable detailed logging to capture more context about this error",
    );
    suggestions.push("• Review recent deployments and configuration changes");
    suggestions.push(
      "• Monitor error frequency and implement alerting if not already in place",
    );
  }

  // Add investigation steps
  suggestions.push(
    "• **Investigation:** Use Error Reporting to view recent occurrences and stack traces",
  );
  suggestions.push(
    "• Check related logs in Cloud Logging for additional context",
  );
  suggestions.push("• Review monitoring dashboards for correlated metrics");

  return suggestions.join("\n");
}
