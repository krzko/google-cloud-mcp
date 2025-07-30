/**
 * Google Cloud Profiler resources for MCP
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectId, initGoogleAuth } from "../../utils/auth.js";
import { GcpMcpError } from "../../utils/error.js";
import {
  analyseProfilePatterns,
  formatProfileSummary,
  getProfileTypeDescription,
  Profile,
  ProfileType,
  ListProfilesResponse,
} from "./types.js";

/**
 * Registers Google Cloud Profiler resources with the MCP server
 *
 * @param server The MCP server instance
 */
export function registerProfilerResources(server: McpServer): void {
  // Resource template for listing all profiles with analysis
  server.resource(
    "gcp-profiler-all-profiles",
    new ResourceTemplate("gcp-profiler://{projectId}/profiles", {
      list: undefined,
    }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());

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

        // Build query parameters for comprehensive data collection
        const params = new URLSearchParams({
          pageSize: "100",
        });

        // Make REST API call to list profiles
        const apiUrl = `https://cloudprofiler.googleapis.com/v2/projects/${actualProjectId}/profiles?${params}`;

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
        const profiles = data.profiles || [];

        if (!profiles || profiles.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Google Cloud Profiler Profiles\n\nProject: ${actualProjectId}\n\nNo profiles found. Ensure Cloud Profiler is enabled and collecting data for your applications.`,
                mimeType: "text/markdown",
              },
            ],
          };
        }

        // Generate comprehensive analysis
        const analysis = analyseProfilePatterns(profiles);

        let content = `# Google Cloud Profiler Profiles\n\nProject: ${actualProjectId}\nTotal Profiles: ${profiles.length}\n`;
        if (data.nextPageToken)
          content += `More profiles available (truncated view)\n`;
        if (data.skippedProfiles)
          content += `Skipped Profiles: ${data.skippedProfiles}\n`;
        content += `\n${analysis}\n\n`;

        // Add profile details
        content += `## Profile Details\n\n`;
        profiles.forEach((profile, index) => {
          content += `### Profile ${index + 1}\n${formatProfileSummary(profile)}\n`;
        });

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
              mimeType: "text/markdown",
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch profiler profiles resource: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Resource template for CPU profiles with specific analysis
  server.resource(
    "gcp-profiler-cpu-profiles",
    new ResourceTemplate("gcp-profiler://{projectId}/cpu-profiles", {
      list: undefined,
    }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());

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

        // Build query parameters
        const params = new URLSearchParams({
          pageSize: "100",
        });

        // Make REST API call
        const apiUrl = `https://cloudprofiler.googleapis.com/v2/projects/${actualProjectId}/profiles?${params}`;

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
            `Failed to fetch CPU profiles: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data: ListProfilesResponse = await response.json();
        const allProfiles = data.profiles || [];

        // Filter for CPU profiles only
        const cpuProfiles = allProfiles.filter(
          (p) => p.profileType === ProfileType.CPU,
        );

        if (!cpuProfiles || cpuProfiles.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# CPU Profiles\n\nProject: ${projectId}\n\nNo CPU profiles found. Ensure CPU profiling is enabled for your applications.`,
                mimeType: "text/markdown",
              },
            ],
          };
        }

        let content = `# CPU Performance Profiles\n\nProject: ${projectId}\nCPU Profiles: ${cpuProfiles.length} (of ${allProfiles.length} total)\n\n`;

        // CPU-specific analysis
        content += `## CPU Performance Analysis\n\n`;
        content += `${getProfileTypeDescription(ProfileType.CPU)}\n\n`;

        content += `**CPU Profiling Insights:**\n`;
        content += `- **Profile Count:** ${cpuProfiles.length} CPU profiles available\n`;
        content += `- **Analysis Focus:** Identify CPU hotspots and compute-intensive operations\n`;
        content += `- **Optimisation Targets:** Functions with high CPU usage and frequent execution\n\n`;

        // Generate analysis for CPU profiles
        const analysis = analyseProfilePatterns(cpuProfiles);
        content += analysis;

        // CPU-specific recommendations
        content += `\n## CPU Optimisation Recommendations\n\n`;
        content += `**Performance Analysis:**\n`;
        content += `- Review CPU-intensive functions for algorithmic improvements\n`;
        content += `- Look for opportunities to optimise loops and recursive operations\n`;
        content += `- Consider parallelisation for CPU-bound workloads\n`;
        content += `- Profile before and after optimisations to measure impact\n\n`;

        content += `**Development Best Practices:**\n`;
        content += `- Use CPU profiling during development to identify bottlenecks early\n`;
        content += `- Set up continuous CPU profiling for production monitoring\n`;
        content += `- Establish CPU usage baselines for performance regression detection\n`;

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
              mimeType: "text/markdown",
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch CPU profiles resource: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Resource template for memory profiles with heap analysis
  server.resource(
    "gcp-profiler-memory-profiles",
    new ResourceTemplate("gcp-profiler://{projectId}/memory-profiles", {
      list: undefined,
    }),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());

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

        const params = new URLSearchParams({
          pageSize: "100",
        });

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
            `Failed to fetch memory profiles: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data: ListProfilesResponse = await response.json();
        const allProfiles = data.profiles || [];

        // Filter for memory-related profiles
        const memoryProfiles = allProfiles.filter(
          (p) =>
            p.profileType === ProfileType.HEAP ||
            p.profileType === ProfileType.HEAP_ALLOC ||
            p.profileType === ProfileType.PEAK_HEAP,
        );

        if (!memoryProfiles || memoryProfiles.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Memory Profiles\n\nProject: ${projectId}\n\nNo memory profiles found. Ensure heap profiling is enabled for your applications.`,
                mimeType: "text/markdown",
              },
            ],
          };
        }

        let content = `# Memory Performance Profiles\n\nProject: ${projectId}\nMemory Profiles: ${memoryProfiles.length} (of ${allProfiles.length} total)\n\n`;

        // Memory-specific analysis
        content += `## Memory Profiling Analysis\n\n`;

        // Analyse by memory profile type
        const heapProfiles = memoryProfiles.filter(
          (p) => p.profileType === ProfileType.HEAP,
        );
        const allocProfiles = memoryProfiles.filter(
          (p) => p.profileType === ProfileType.HEAP_ALLOC,
        );
        const peakProfiles = memoryProfiles.filter(
          (p) => p.profileType === ProfileType.PEAK_HEAP,
        );

        content += `**Memory Profile Distribution:**\n`;
        if (heapProfiles.length > 0) {
          content += `- **Heap Profiles:** ${heapProfiles.length} - Current memory allocations\n`;
        }
        if (allocProfiles.length > 0) {
          content += `- **Allocation Profiles:** ${allocProfiles.length} - Memory allocation patterns\n`;
        }
        if (peakProfiles.length > 0) {
          content += `- **Peak Heap Profiles:** ${peakProfiles.length} - Maximum memory usage\n`;
        }
        content += `\n`;

        // Generate analysis for memory profiles
        const analysis = analyseProfilePatterns(memoryProfiles);
        content += analysis;

        // Memory-specific recommendations
        content += `\n## Memory Optimisation Recommendations\n\n`;
        content += `**Memory Management:**\n`;
        content += `- Analyse allocation patterns to identify memory-intensive operations\n`;
        content += `- Look for memory leaks and objects that aren't being garbage collected\n`;
        content += `- Consider object pooling for frequently allocated objects\n`;
        content += `- Review data structures for memory efficiency\n\n`;

        content += `**Performance Tuning:**\n`;
        content += `- Monitor peak memory usage to right-size instance resources\n`;
        content += `- Set up memory usage alerts based on profiling data\n`;
        content += `- Use allocation profiling to optimise hot allocation paths\n`;
        content += `- Compare memory usage before and after code changes\n`;

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
              mimeType: "text/markdown",
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch memory profiles resource: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );

  // Resource template for performance recommendations based on all profiles
  server.resource(
    "gcp-profiler-performance-recommendations",
    new ResourceTemplate(
      "gcp-profiler://{projectId}/performance-recommendations",
      {
        list: undefined,
      },
    ),
    async (uri, { projectId }) => {
      try {
        const actualProjectId = projectId || (await getProjectId());

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

        const params = new URLSearchParams({
          pageSize: "200", // Get more data for better recommendations
        });

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
            `Failed to fetch profiles for recommendations: ${errorText}`,
            "FAILED_PRECONDITION",
            response.status,
          );
        }

        const data: ListProfilesResponse = await response.json();
        const profiles = data.profiles || [];

        if (!profiles || profiles.length === 0) {
          return {
            contents: [
              {
                uri: uri.href,
                text: `# Performance Recommendations\n\nProject: ${projectId}\n\nNo profiles available to generate recommendations. Enable Cloud Profiler for your applications to get performance insights.`,
                mimeType: "text/markdown",
              },
            ],
          };
        }

        let content = `# Performance Recommendations\n\nProject: ${projectId}\nBased on ${profiles.length} profiles\n\n`;

        // Generate comprehensive analysis
        const analysis = analyseProfilePatterns(profiles);
        content += analysis;

        // Add comprehensive recommendations section
        content += `\n## Comprehensive Performance Strategy\n\n`;

        content += `### Immediate Actions\n\n`;
        content += `1. **Profile Review:** Analyse the ${profiles.length} collected profiles for immediate optimisation opportunities\n`;
        content += `2. **Hotspot Identification:** Focus on the most CPU and memory-intensive operations\n`;
        content += `3. **Baseline Establishment:** Use current profile data to establish performance baselines\n\n`;

        content += `### Medium-term Optimisations\n\n`;
        content += `1. **Continuous Profiling:** Set up automated profiling and monitoring\n`;
        content += `2. **Performance Testing:** Integrate profiling into your testing pipeline\n`;
        content += `3. **Resource Optimisation:** Right-size resources based on profiling insights\n\n`;

        content += `### Long-term Performance Culture\n\n`;
        content += `1. **Performance Budgets:** Establish performance budgets based on profiling data\n`;
        content += `2. **Regression Detection:** Set up alerts for performance regressions\n`;
        content += `3. **Team Education:** Train development teams on performance profiling techniques\n`;

        return {
          contents: [
            {
              uri: uri.href,
              text: content,
              mimeType: "text/markdown",
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        throw new GcpMcpError(
          `Failed to fetch performance recommendations resource: ${errorMessage}`,
          "INTERNAL_ERROR",
          500,
        );
      }
    },
  );
}
