/**
 * Type definitions for Google Cloud Profiler service
 */
import { initGoogleAuth } from "../../utils/auth.js";

/**
 * Interface for Google Cloud Profile (matches REST API schema)
 */
export interface Profile {
  /** Opaque, server-assigned, unique ID for the profile */
  name: string;
  /** Type of profile data collected */
  profileType: ProfileType;
  /** Deployment information for the profile */
  deployment: Deployment;
  /** Duration of the profile collection */
  duration: string;
  /** Gzip compressed serialized profile data in protobuf format */
  profileBytes: string;
  /** Additional labels for the profile */
  labels: Record<string, string>;
  /** Timestamp when profile collection started */
  startTime: string;
}

/**
 * Enum for different profile types supported by Cloud Profiler
 */
export enum ProfileType {
  UNSPECIFIED = "PROFILE_TYPE_UNSPECIFIED",
  CPU = "CPU",
  WALL = "WALL",
  HEAP = "HEAP",
  THREADS = "THREADS",
  CONTENTION = "CONTENTION",
  PEAK_HEAP = "PEAK_HEAP",
  HEAP_ALLOC = "HEAP_ALLOC",
}

/**
 * Interface for deployment information
 */
export interface Deployment {
  /** Project ID where the deployment is running */
  projectId: string;
  /** Target name for the deployment (e.g., service name) */
  target: string;
  /** Additional labels for the deployment */
  labels: Record<string, string>;
}

/**
 * Response from the list profiles API
 */
export interface ListProfilesResponse {
  /** List of profiles found */
  profiles: Profile[];
  /** Token for pagination to next page */
  nextPageToken?: string;
  /** Number of profiles that couldn't be fetched */
  skippedProfiles?: number;
}

/**
 * Profile analysis result
 */
export interface ProfileAnalysis {
  profile: Profile;
  analysisType: string;
  insights: string[];
  recommendations: string[];
  metrics: ProfileMetrics;
}

/**
 * Metrics extracted from profile analysis
 */
export interface ProfileMetrics {
  duration: number; // in seconds
  samplingRate?: number;
  hotspots: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

/**
 * Formats a profile summary for display
 */
export function formatProfileSummary(profile: Profile): string {
  const profileName = profile.name || "Unknown";
  const profileType = profile.profileType || "Unknown";
  const deployment = profile.deployment || {};
  const target = deployment.target || "Unknown";
  const projectId = deployment.projectId || "Unknown";
  const startTime = profile.startTime
    ? new Date(profile.startTime).toLocaleString()
    : "Unknown";
  const duration = profile.duration || "Unknown";

  let summary = `## Profile: ${profileName.split("/").pop()}\n\n`;
  summary += `**Type:** ${getProfileTypeDescription(profileType)}\n`;
  summary += `**Target:** ${target}\n`;
  summary += `**Project:** ${projectId}\n`;
  summary += `**Start Time:** ${startTime}\n`;
  summary += `**Duration:** ${formatDuration(duration)}\n`;

  // Add labels if available
  if (profile.labels && Object.keys(profile.labels).length > 0) {
    summary += `**Labels:**\n`;
    Object.entries(profile.labels).forEach(([key, value]) => {
      summary += `  - ${key}: ${value}\n`;
    });
  }

  // Add deployment labels if available
  if (deployment.labels && Object.keys(deployment.labels).length > 0) {
    summary += `**Deployment Labels:**\n`;
    Object.entries(deployment.labels).forEach(([key, value]) => {
      summary += `  - ${key}: ${value}\n`;
    });
  }

  return summary;
}

/**
 * Gets a human-readable description for profile types
 */
export function getProfileTypeDescription(
  profileType: ProfileType | string,
): string {
  switch (profileType) {
    case ProfileType.CPU:
      return "CPU Time - Shows where your application spends CPU time";
    case ProfileType.WALL:
      return "Wall Time - Shows elapsed time including I/O waits and blocking calls";
    case ProfileType.HEAP:
      return "Heap Memory - Shows memory allocations and usage patterns";
    case ProfileType.THREADS:
      return "Threads/Goroutines - Shows thread or goroutine activity and concurrency";
    case ProfileType.CONTENTION:
      return "Contention - Shows lock contention and synchronisation overhead";
    case ProfileType.PEAK_HEAP:
      return "Peak Heap - Shows maximum heap memory usage";
    case ProfileType.HEAP_ALLOC:
      return "Heap Allocations - Shows memory allocation patterns and frequency";
    default:
      return `${profileType} - Profile data type`;
  }
}

/**
 * Formats duration string from ISO 8601 format to human readable
 */
export function formatDuration(duration: string): string {
  if (!duration) return "Unknown";

  // Parse ISO 8601 duration (e.g., "PT30S" = 30 seconds)
  const match = duration.match(/PT(\d+(?:\.\d+)?)([HMS])/);
  if (!match) return duration;

  const value = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case "S":
      return `${value} seconds`;
    case "M":
      return `${value} minutes`;
    case "H":
      return `${value} hours`;
    default:
      return duration;
  }
}

/**
 * Analyses multiple profiles to provide insights and recommendations
 */
export function analyseProfilePatterns(profiles: Profile[]): string {
  if (!profiles || profiles.length === 0) {
    return "No profiles found in the specified criteria.";
  }

  let analysis = `# Profile Analysis and Performance Insights\n\n`;

  // Profile summary statistics
  const totalProfiles = profiles.length;
  const profileTypes = [...new Set(profiles.map((p) => p.profileType))];
  const targets = [
    ...new Set(profiles.map((p) => p.deployment?.target).filter(Boolean)),
  ];

  analysis += `## Summary\n\n`;
  analysis += `- **Total Profiles:** ${totalProfiles}\n`;
  analysis += `- **Profile Types:** ${profileTypes.length} (${profileTypes.join(", ")})\n`;
  analysis += `- **Targets:** ${targets.length} (${targets.join(", ")})\n\n`;

  // Profile type distribution
  const typeDistribution = profiles.reduce(
    (acc, profile) => {
      acc[profile.profileType] = (acc[profile.profileType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  analysis += `## Profile Type Distribution\n\n`;
  Object.entries(typeDistribution)
    .sort(([, a], [, b]) => b - a)
    .forEach(([type, count]) => {
      const percentage = Math.round((count / totalProfiles) * 100);
      analysis += `- **${getProfileTypeDescription(type)}:** ${count} profiles (${percentage}%)\n`;
    });

  analysis += `\n`;

  // Recent activity analysis
  const recentProfiles = profiles
    .filter((p) => p.startTime)
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    )
    .slice(0, 5);

  if (recentProfiles.length > 0) {
    analysis += `## Recent Profile Activity\n\n`;
    recentProfiles.forEach((profile, index) => {
      const timeAgo = getTimeAgo(profile.startTime);
      analysis += `${index + 1}. **${profile.deployment?.target || "Unknown Target"}** - ${getProfileTypeDescription(profile.profileType)} (${timeAgo})\n`;
    });
    analysis += `\n`;
  }

  // Performance analysis by profile type
  analysis += `## Performance Analysis by Profile Type\n\n`;

  profileTypes.forEach((type) => {
    const typeProfiles = profiles.filter((p) => p.profileType === type);
    analysis += `### ${getProfileTypeDescription(type)}\n\n`;
    analysis += getProfileTypeAnalysis(type, typeProfiles);
    analysis += `\n`;
  });

  // Recommendations
  analysis += `## Recommendations\n\n`;
  analysis += getPerformanceRecommendations(profiles, typeDistribution);

  return analysis;
}

/**
 * Gets time ago string from timestamp
 */
function getTimeAgo(timestamp: string): string {
  const now = new Date().getTime();
  const time = new Date(timestamp).getTime();
  const diffMinutes = Math.floor((now - time) / (1000 * 60));

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  } else if (diffMinutes < 1440) {
    return `${Math.floor(diffMinutes / 60)} hours ago`;
  } else {
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  }
}

/**
 * Provides analysis specific to profile type
 */
function getProfileTypeAnalysis(
  profileType: ProfileType | string,
  profiles: Profile[],
): string {
  const count = profiles.length;
  let analysis = `**Found ${count} ${profileType} profiles**\n\n`;

  switch (profileType) {
    case ProfileType.CPU:
      analysis += `**CPU Profiling Analysis:**\n`;
      analysis += `- Identifies hotspots and CPU-intensive functions\n`;
      analysis += `- Look for functions with high self-time vs. total time\n`;
      analysis += `- Consider optimising frequently called functions\n`;
      analysis += `- Check for inefficient algorithms or loops\n`;
      break;

    case ProfileType.HEAP:
      analysis += `**Memory Profiling Analysis:**\n`;
      analysis += `- Shows memory allocation patterns and potential leaks\n`;
      analysis += `- Look for objects with high allocation rates\n`;
      analysis += `- Identify memory retention issues\n`;
      analysis += `- Check for unnecessary object creation\n`;
      break;

    case ProfileType.WALL:
      analysis += `**Wall Time Profiling Analysis:**\n`;
      analysis += `- Shows real elapsed time including I/O operations\n`;
      analysis += `- Identifies blocking operations and wait times\n`;
      analysis += `- Look for slow network calls or database queries\n`;
      analysis += `- Check for inefficient synchronous operations\n`;
      break;

    case ProfileType.CONTENTION:
      analysis += `**Lock Contention Analysis:**\n`;
      analysis += `- Shows synchronisation overhead and lock conflicts\n`;
      analysis += `- Look for heavily contended locks or mutexes\n`;
      analysis += `- Consider lock-free algorithms or reduced lock scope\n`;
      analysis += `- Check for deadlock potential\n`;
      break;

    case ProfileType.THREADS:
      analysis += `**Thread/Goroutine Analysis:**\n`;
      analysis += `- Shows concurrency patterns and thread utilisation\n`;
      analysis += `- Look for thread pool exhaustion or oversaturation\n`;
      analysis += `- Check for optimal concurrency levels\n`;
      analysis += `- Identify blocking goroutines or threads\n`;
      break;

    default:
      analysis += `**General Analysis:**\n`;
      analysis += `- Review profile data for performance patterns\n`;
      analysis += `- Look for resource usage anomalies\n`;
      analysis += `- Compare with baseline performance metrics\n`;
      break;
  }

  return analysis;
}

/**
 * Generates performance recommendations based on profile analysis
 */
function getPerformanceRecommendations(
  _profiles: Profile[],
  typeDistribution: Record<string, number>,
): string {
  let recommendations = "";

  // Recommendations based on profile types present
  if (typeDistribution[ProfileType.CPU] > 0) {
    recommendations += `**CPU Optimisation:**\n`;
    recommendations += `- Profile your application to identify CPU hotspots\n`;
    recommendations += `- Consider algorithm optimisations for high-usage functions\n`;
    recommendations += `- Review and optimise nested loops and recursive functions\n\n`;
  }

  if (typeDistribution[ProfileType.HEAP] > 0) {
    recommendations += `**Memory Management:**\n`;
    recommendations += `- Monitor memory allocation patterns for optimisation opportunities\n`;
    recommendations += `- Consider object pooling for frequently allocated objects\n`;
    recommendations += `- Review memory retention and garbage collection patterns\n\n`;
  }

  if (typeDistribution[ProfileType.WALL] > 0) {
    recommendations += `**I/O and Latency Optimisation:**\n`;
    recommendations += `- Profile I/O operations to identify bottlenecks\n`;
    recommendations += `- Consider asynchronous operations for blocking calls\n`;
    recommendations += `- Implement caching for frequently accessed data\n\n`;
  }

  if (typeDistribution[ProfileType.CONTENTION] > 0) {
    recommendations += `**Concurrency Optimisation:**\n`;
    recommendations += `- Review lock usage and consider reducing critical sections\n`;
    recommendations += `- Evaluate lock-free data structures and algorithms\n`;
    recommendations += `- Analyse thread synchronisation patterns\n\n`;
  }

  // General recommendations
  recommendations += `**General Performance Best Practices:**\n`;
  recommendations += `- Establish baseline performance metrics\n`;
  recommendations += `- Set up continuous profiling for production monitoring\n`;
  recommendations += `- Correlate profile data with application metrics and logs\n`;
  recommendations += `- Use profile data to guide performance testing scenarios\n`;

  return recommendations;
}

/**
 * Gets Google Cloud authentication for Profiler API access
 */
export async function getProfilerAuth() {
  const auth = await initGoogleAuth(true);
  if (!auth) {
    throw new Error("Google Cloud authentication not available");
  }

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  return { auth, token: token.token };
}
