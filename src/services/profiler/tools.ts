/**
 * Google Cloud Profiler tools for MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectId, initGoogleAuth } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import {
  formatProfileSummary,
  analyseProfilePatterns,
  getProfileTypeDescription,
  Profile,
  ProfileType,
  ListProfilesResponse,
} from "./types.js";

/**
 * Registers Google Cloud Profiler tools with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerProfilerTools(server: McpServer): void {
  // Tool to list profiles with filtering and pagination support
  server.tool(
    "gcp-profiler-list-profiles",
    {
      title: "List Profiles",
      description:
        "List profiles from Google Cloud Profiler with optional filtering and pagination",
      inputSchema: {
        pageSize: z
          .number()
          .min(1)
          .max(1000)
          .default(50)
          .describe("Maximum number of profiles to return (1-1000)"),
        pageToken: z
          .string()
          .optional()
          .describe("Token for pagination to get next page of results"),
        profileType: z
          .enum([
            ProfileType.CPU,
            ProfileType.WALL,
            ProfileType.HEAP,
            ProfileType.THREADS,
            ProfileType.CONTENTION,
            ProfileType.PEAK_HEAP,
            ProfileType.HEAP_ALLOC,
          ])
          .optional()
          .describe("Filter by specific profile type"),
        target: z
          .string()
          .optional()
          .describe("Filter by deployment target (service name)"),
      },
    },
    async ({ pageSize, pageToken, profileType, target }) => {
      try {
        const projectId = await getProjectId();

        // Initialize Google Auth client (same pattern as error reporting)
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access profiler data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Parse parameters
        const actualPageSize = pageSize || 50;

        // Build query parameters
        const params = new URLSearchParams({
          pageSize: actualPageSize.toString(),
        });

        // Add page token if provided
        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        // Make REST API call to list profiles
        const apiUrl = `https://cloudprofiler.googleapis.com/v2/projects/${projectId}/profiles?${params}`;

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
            `Failed to fetch profiles: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data: ListProfilesResponse = await response.json();
        let profiles = data.profiles || [];

        // Apply client-side filtering if specified
        if (profileType) {
          profiles = profiles.filter((p) => p.profileType === profileType);
        }

        if (target) {
          profiles = profiles.filter((p) =>
            p.deployment?.target?.toLowerCase().includes(target.toLowerCase()),
          );
        }

        if (!profiles || profiles.length === 0) {
          let filterText = "";
          if (profileType) filterText += `Profile Type: ${profileType}\n`;
          if (target) filterText += `Target: ${target}\n`;

          return {
            content: [
              {
                type: "text",
                text: `# Profiles\n\nProject: ${projectId}\n${filterText}${data.nextPageToken ? `Page Token: ${pageToken || "first"}\n` : ""}No profiles found.`,
              },
            ],
          };
        }

        // Generate analysis and insights
        const analysis = analyseProfilePatterns(profiles);

        let content = `# Profiler Analysis\n\nProject: ${projectId}\n`;
        if (profileType)
          content += `Profile Type Filter: ${getProfileTypeDescription(profileType)}\n`;
        if (target) content += `Target Filter: ${target}\n`;
        if (data.nextPageToken)
          content += `Next Page Available: Use token "${data.nextPageToken}"\n`;
        if (data.skippedProfiles)
          content += `Skipped Profiles: ${data.skippedProfiles}\n`;
        content += `\n${analysis}\n\n`;

        content += `## Detailed Profile List\n\n`;

        profiles.forEach((profile, index) => {
          content += `### ${index + 1}. ${formatProfileSummary(profile)}\n`;
        });

        // Add pagination info if available
        if (data.nextPageToken) {
          content += `\n---\n\n**Pagination:** Use page token "${data.nextPageToken}" to get the next ${actualPageSize} results.\n`;
        }

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
          `Failed to list profiles: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Tool to get detailed analysis of specific profile types and patterns
  server.tool(
    "gcp-profiler-analyse-performance",
    {
      title: "Analyse Profile Performance",
      description:
        "Analyse profiles to identify performance patterns, bottlenecks, and optimisation opportunities",
      inputSchema: {
        profileType: z
          .enum([
            ProfileType.CPU,
            ProfileType.WALL,
            ProfileType.HEAP,
            ProfileType.THREADS,
            ProfileType.CONTENTION,
            ProfileType.PEAK_HEAP,
            ProfileType.HEAP_ALLOC,
          ])
          .optional()
          .describe("Focus analysis on specific profile type"),
        target: z
          .string()
          .optional()
          .describe("Focus analysis on specific deployment target"),
        pageSize: z
          .number()
          .min(1)
          .max(1000)
          .default(100)
          .describe(
            "Number of profiles to analyse (more profiles = better insights)",
          ),
      },
    },
    async ({ profileType, target, pageSize }) => {
      try {
        const projectId = await getProjectId();

        // Initialize Google Auth client (same pattern as error reporting)
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access profiler data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        // Parse parameters
        const actualPageSize = pageSize || 100;

        // Build query parameters for maximum data collection
        const params = new URLSearchParams({
          pageSize: actualPageSize.toString(),
        });

        // Make REST API call to list profiles
        const apiUrl = `https://cloudprofiler.googleapis.com/v2/projects/${projectId}/profiles?${params}`;

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
            `Failed to fetch profiles for analysis: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data: ListProfilesResponse = await response.json();
        let profiles = data.profiles || [];

        // Apply filtering if specified
        if (profileType) {
          profiles = profiles.filter((p) => p.profileType === profileType);
        }

        if (target) {
          profiles = profiles.filter((p) =>
            p.deployment?.target?.toLowerCase().includes(target.toLowerCase()),
          );
        }

        if (!profiles || profiles.length === 0) {
          let filterText = "No profiles found for analysis";
          if (profileType) filterText += ` with profile type: ${profileType}`;
          if (target) filterText += ` and target: ${target}`;

          return {
            content: [
              {
                type: "text",
                text: `# Profile Performance Analysis\n\nProject: ${projectId}\n\n${filterText}.`,
              },
            ],
          };
        }

        // Generate comprehensive analysis
        let content = `# Profile Performance Analysis\n\nProject: ${projectId}\n`;
        if (profileType)
          content += `Focus: ${getProfileTypeDescription(profileType)}\n`;
        if (target) content += `Target: ${target}\n`;
        content += `Analysed: ${profiles.length} profiles\n\n`;

        // Get detailed analysis
        const analysis = analyseProfilePatterns(profiles);
        content += analysis;

        // Add performance insights specific to the analysis
        content += `\n## Performance Insights\n\n`;

        // Analyse profile collection patterns
        const timeDistribution = analyseProfileTimeDistribution(profiles);
        content += timeDistribution;

        // Analyse deployment patterns
        const deploymentAnalysis = analyseDeploymentPatterns(profiles);
        content += deploymentAnalysis;

        // Add actionable recommendations
        content += `\n## Actionable Recommendations\n\n`;
        content += getActionableRecommendations(profiles, profileType);

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
          `Failed to analyse profile performance: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Tool to compare profiles and identify performance trends
  server.tool(
    "gcp-profiler-compare-trends",
    {
      title: "Compare Profile Trends",
      description:
        "Compare profiles over time to identify performance trends, regressions, and improvements",
      inputSchema: {
        target: z
          .string()
          .optional()
          .describe("Focus comparison on specific deployment target"),
        profileType: z
          .enum([
            ProfileType.CPU,
            ProfileType.WALL,
            ProfileType.HEAP,
            ProfileType.THREADS,
            ProfileType.CONTENTION,
            ProfileType.PEAK_HEAP,
            ProfileType.HEAP_ALLOC,
          ])
          .optional()
          .describe("Focus comparison on specific profile type"),
        pageSize: z
          .number()
          .min(1)
          .max(1000)
          .default(200)
          .describe("Number of profiles to analyse for trends"),
      },
    },
    async ({ target, profileType, pageSize }) => {
      try {
        const projectId = await getProjectId();

        // Initialize Google Auth client
        const auth = await initGoogleAuth(true);
        if (!auth) {
          throw new GcpMcpError(
            "Google Cloud authentication not available. Please configure authentication to access profiler data.",
            "UNAUTHENTICATED",
            401,
          );
        }
        const client = await auth.getClient();
        const token = await client.getAccessToken();

        const actualPageSize = pageSize || 200;

        // Build query parameters
        const params = new URLSearchParams({
          pageSize: actualPageSize.toString(),
        });

        // Make REST API call to list profiles
        const apiUrl = `https://cloudprofiler.googleapis.com/v2/projects/${projectId}/profiles?${params}`;

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
            `Failed to fetch profiles for trend analysis: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data: ListProfilesResponse = await response.json();
        let profiles = data.profiles || [];

        // Apply filtering
        if (profileType) {
          profiles = profiles.filter((p) => p.profileType === profileType);
        }

        if (target) {
          profiles = profiles.filter((p) =>
            p.deployment?.target?.toLowerCase().includes(target.toLowerCase()),
          );
        }

        if (!profiles || profiles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `# Profile Trend Analysis\n\nProject: ${projectId}\n\nNo profiles found for trend analysis.`,
              },
            ],
          };
        }

        // Generate trend analysis
        let content = `# Profile Trend Analysis\n\nProject: ${projectId}\n`;
        if (profileType)
          content += `Profile Type: ${getProfileTypeDescription(profileType)}\n`;
        if (target) content += `Target: ${target}\n`;
        content += `Analysed: ${profiles.length} profiles\n\n`;

        // Analyse trends over time
        const trendAnalysis = analyseProfileTrends(profiles);
        content += trendAnalysis;

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
          `Failed to analyse profile trends: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );
}

/**
 * Analyses profile collection time distribution
 */
function analyseProfileTimeDistribution(profiles: Profile[]): string {
  const profilesByTime = profiles
    .filter((p) => p.startTime)
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

  if (profilesByTime.length === 0) {
    return "No time-stamped profiles available for temporal analysis.\n\n";
  }

  let analysis = "### Profile Collection Timeline\n\n";

  // Group by time buckets (last 24 hours, last week, older)
  const now = new Date().getTime();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const recent = profilesByTime.filter(
    (p) => new Date(p.startTime).getTime() > oneDayAgo,
  );
  const thisWeek = profilesByTime.filter((p) => {
    const time = new Date(p.startTime).getTime();
    return time <= oneDayAgo && time > oneWeekAgo;
  });
  const older = profilesByTime.filter(
    (p) => new Date(p.startTime).getTime() <= oneWeekAgo,
  );

  analysis += `- **Last 24 hours:** ${recent.length} profiles\n`;
  analysis += `- **Last week:** ${thisWeek.length} profiles\n`;
  analysis += `- **Older:** ${older.length} profiles\n\n`;

  if (recent.length > 0) {
    const oldestRecent = new Date(recent[0].startTime).toLocaleString();
    const newestRecent = new Date(
      recent[recent.length - 1].startTime,
    ).toLocaleString();
    analysis += `Recent activity spans from ${oldestRecent} to ${newestRecent}\n\n`;
  }

  return analysis;
}

/**
 * Analyses deployment patterns across profiles
 */
function analyseDeploymentPatterns(profiles: Profile[]): string {
  let analysis = "### Deployment Analysis\n\n";

  // Analyse targets
  const targetCounts = profiles.reduce(
    (acc, profile) => {
      const target = profile.deployment?.target || "Unknown";
      acc[target] = (acc[target] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  analysis += `**Target Distribution:**\n`;
  Object.entries(targetCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([target, count]) => {
      const percentage = Math.round((count / profiles.length) * 100);
      analysis += `- ${target}: ${count} profiles (${percentage}%)\n`;
    });

  analysis += `\n`;

  // Analyse labels if available
  const allLabels = new Set<string>();
  profiles.forEach((profile) => {
    Object.keys(profile.labels || {}).forEach((label) => allLabels.add(label));
    Object.keys(profile.deployment?.labels || {}).forEach((label) =>
      allLabels.add(label),
    );
  });

  if (allLabels.size > 0) {
    analysis += `**Common Labels Found:** ${Array.from(allLabels).join(", ")}\n\n`;
  }

  return analysis;
}

/**
 * Generates actionable recommendations based on profile analysis
 */
function getActionableRecommendations(
  profiles: Profile[],
  profileType?: ProfileType,
): string {
  let recommendations = "";

  const targets = [
    ...new Set(profiles.map((p) => p.deployment?.target).filter(Boolean)),
  ];
  const hasMultipleTargets = targets.length > 1;

  recommendations += `**Immediate Actions:**\n`;
  recommendations += `- Review the ${profiles.length} profiles for performance patterns\n`;

  if (hasMultipleTargets) {
    recommendations += `- Compare performance across ${targets.length} different targets\n`;
  }

  if (profileType) {
    switch (profileType) {
      case ProfileType.CPU:
        recommendations += `- Identify CPU hotspots and optimise high-usage functions\n`;
        recommendations += `- Look for algorithms that can be optimised or parallelised\n`;
        break;
      case ProfileType.HEAP:
        recommendations += `- Review memory allocation patterns for optimisation\n`;
        recommendations += `- Check for memory leaks or excessive garbage collection\n`;
        break;
      case ProfileType.WALL:
        recommendations += `- Identify blocking I/O operations and network calls\n`;
        recommendations += `- Consider asynchronous processing for slow operations\n`;
        break;
    }
  }

  recommendations += `\n**Long-term Optimisation:**\n`;
  recommendations += `- Set up continuous profiling alerts for performance regressions\n`;
  recommendations += `- Establish performance baselines for each service\n`;
  recommendations += `- Integrate profiling data with monitoring and alerting systems\n`;
  recommendations += `- Use profile data to guide load testing and capacity planning\n`;

  return recommendations;
}

/**
 * Analyses performance trends over time
 */
function analyseProfileTrends(profiles: Profile[]): string {
  const profilesByTime = profiles
    .filter((p) => p.startTime)
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

  if (profilesByTime.length < 2) {
    return "Insufficient time-series data for trend analysis. Need at least 2 time-stamped profiles.\n";
  }

  let analysis = "## Trend Analysis\n\n";

  // Analyse profile frequency over time
  analysis += "### Profile Collection Frequency\n\n";

  const earliest = new Date(profilesByTime[0].startTime);
  const latest = new Date(profilesByTime[profilesByTime.length - 1].startTime);
  const timeSpan = latest.getTime() - earliest.getTime();
  const timeSpanDays = timeSpan / (1000 * 60 * 60 * 24);

  analysis += `- **Time Span:** ${Math.round(timeSpanDays)} days (from ${earliest.toLocaleDateString()} to ${latest.toLocaleDateString()})\n`;
  analysis += `- **Collection Frequency:** ${Math.round(profiles.length / timeSpanDays)} profiles per day\n\n`;

  // Analyse profile type trends
  analysis += "### Profile Type Trends\n\n";

  const typesByTime = profilesByTime.reduce(
    (acc, profile) => {
      const day = new Date(profile.startTime).toDateString();
      if (!acc[day]) acc[day] = {};
      acc[day][profile.profileType] = (acc[day][profile.profileType] || 0) + 1;
      return acc;
    },
    {} as Record<string, Record<string, number>>,
  );

  const days = Object.keys(typesByTime).sort();
  if (days.length > 1) {
    analysis += `Collected profiles across ${days.length} different days:\n\n`;
    days.slice(-5).forEach((day) => {
      // Show last 5 days
      const typeCounts = typesByTime[day];
      const totalForDay = Object.values(typeCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      analysis += `**${day}:** ${totalForDay} profiles (`;
      analysis += Object.entries(typeCounts)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ");
      analysis += `)\n`;
    });
    analysis += `\n`;
  }

  // Recommendations based on trends
  analysis += "### Trend-Based Recommendations\n\n";

  if (timeSpanDays < 1) {
    analysis += `- **Short timeframe:** Consider collecting profiles over a longer period for better trend analysis\n`;
  } else if (profiles.length / timeSpanDays < 1) {
    analysis += `- **Low frequency:** Consider increasing profile collection frequency for better insights\n`;
  } else {
    analysis += `- **Good coverage:** Profile collection frequency appears adequate for trend analysis\n`;
  }

  analysis += `- **Pattern monitoring:** Set up alerts for unusual changes in profile patterns\n`;
  analysis += `- **Performance baseline:** Use this trend data to establish performance baselines\n`;

  return analysis;
}
